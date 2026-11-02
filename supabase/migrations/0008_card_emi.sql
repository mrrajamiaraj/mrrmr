-- Credit card payment plans: each card use is paid back in full by one date, or in monthly EMI installments.
-- Adds 2 columns to card_uses and replaces add_card_use with a version that takes the plan.
-- Existing card uses become 'full' (pay back by their due_on date), so nothing changes for them.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

alter table public.card_uses
  add column pay_plan   text     not null default 'full' check (pay_plan in ('full', 'emi')),
  add column emi_months smallint check (emi_months between 2 and 60),
  -- EMI rows always have a month count and a first installment date (due_on); full rows have no month count.
  add constraint card_uses_emi_shape check (
    (pay_plan = 'full' and emi_months is null) or
    (pay_plan = 'emi' and emi_months is not null and due_on is not null)
  );

drop function if exists public.add_card_use(uuid, text, numeric, text, date, text, date, boolean);

-- Records a card use. p_person_name null/empty or 'me' = my own spending (person_id NULL, always 'full').
-- For 'emi', p_due_on is the first installment date and p_emi_months the number of monthly installments.
create function public.add_card_use(
  p_card_id         uuid,
  p_person_name     text,
  p_amount          numeric,
  p_reason_or_place text,
  p_used_on         date    default current_date,
  p_category        text    default 'Other',
  p_due_on          date    default null,
  p_add_to_balance  boolean default true,
  p_pay_plan        text    default 'full',
  p_emi_months      integer default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_person uuid;
  v_plan   text := coalesce(nullif(btrim(p_pay_plan), ''), 'full');
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above 0.'; end if;
  if not exists (select 1 from cards where id = p_card_id) then raise exception 'Card not found.'; end if;
  if v_plan not in ('full', 'emi') then raise exception 'Pick full payment or EMI.'; end if;

  if p_person_name is not null and btrim(p_person_name) <> '' and lower(btrim(p_person_name)) <> 'me' then
    v_person := find_or_create_person(p_person_name);
  end if;

  if v_person is null then v_plan := 'full'; end if;
  if v_plan = 'emi' then
    if p_emi_months is null or p_emi_months < 2 or p_emi_months > 60 then raise exception 'Pick how many months the EMI runs.'; end if;
    if p_due_on is null then raise exception 'Pick the first installment date.'; end if;
  end if;

  insert into card_uses (card_id, person_id, amount, used_on, reason_or_place, category, due_on, pay_plan, emi_months)
  values (p_card_id, v_person, p_amount, coalesce(p_used_on, current_date), btrim(p_reason_or_place),
          coalesce(nullif(btrim(p_category), ''), 'Other'),
          case when v_person is null then null else p_due_on end,
          v_plan,
          case when v_plan = 'emi' then p_emi_months end);

  if p_add_to_balance then
    update cards set balance = balance + p_amount where id = p_card_id;
  end if;

  return v_person;
end;
$$;

revoke all on function public.add_card_use(uuid, text, numeric, text, date, text, date, boolean, text, integer) from public, anon;
grant execute on function public.add_card_use(uuid, text, numeric, text, date, text, date, boolean, text, integer) to authenticated;
