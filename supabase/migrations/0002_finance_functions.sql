-- Write helpers so every "insert a row + move a balance" happens in ONE transaction.
-- Creates functions only: no tables are created or altered.
-- All functions are SECURITY INVOKER, so the existing "owner only" RLS policies still apply
-- and owner_id keeps coming from the column default (auth.uid()).
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- Finds a person by name (case-insensitive) or creates them. Returns the person id.
create or replace function public.find_or_create_person(p_name text, p_notes text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_name text := btrim(p_name);
  v_id   uuid;
begin
  if v_name is null or v_name = '' then
    raise exception 'Enter a name.';
  end if;

  select id into v_id from people where lower(name) = lower(v_name);
  if v_id is null then
    insert into people (name, notes) values (v_name, nullif(btrim(p_notes), ''))
    on conflict (owner_id, lower(name)) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from people where lower(name) = lower(v_name);
    end if;
  end if;
  return v_id;
end;
$$;

-- Lends money to someone (creating them if new). Optionally takes it out of the account
-- balance, and optionally records money they paid back on the spot.
create or replace function public.add_loan(
  p_person_name    text,
  p_amount         numeric,
  p_reason         text,
  p_taken_on       date    default current_date,
  p_method         text    default 'Bank transfer',
  p_due_on         date    default null,
  p_account_id     uuid    default null,
  p_deduct         boolean default false,
  p_initial_repaid numeric default 0,
  p_notes          text    default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_person uuid;
  v_paid   numeric := coalesce(p_initial_repaid, 0);
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above 0.'; end if;
  if v_paid < 0 or v_paid > p_amount then raise exception 'Initial repaid must be between 0 and the loan amount.'; end if;
  if p_account_id is not null and not exists (select 1 from accounts where id = p_account_id) then
    raise exception 'Account not found.';
  end if;
  if p_deduct and p_account_id is null then raise exception 'Pick an account to take the money from.'; end if;

  v_person := find_or_create_person(p_person_name, p_notes);

  insert into loans (person_id, account_id, amount, taken_on, reason, method, due_on)
  values (v_person, p_account_id, p_amount, coalesce(p_taken_on, current_date), btrim(p_reason),
          coalesce(p_method, 'Bank transfer'), p_due_on);

  if v_paid > 0 then
    insert into repayments (person_id, amount, paid_on, via, applies_to, account_id)
    values (v_person, v_paid, coalesce(p_taken_on, current_date), 'Cash', 'loan', p_account_id);
  end if;

  if p_deduct then
    update accounts set balance = balance - p_amount + v_paid where id = p_account_id;
  end if;

  return v_person;
end;
$$;

-- Records a card use. p_person_name null/empty or 'me' = my own spending (person_id NULL).
-- Optionally adds the amount to the card balance. Returns the person id (null for me).
create or replace function public.add_card_use(
  p_card_id         uuid,
  p_person_name     text,
  p_amount          numeric,
  p_reason_or_place text,
  p_used_on         date    default current_date,
  p_category        text    default 'Other',
  p_due_on          date    default null,
  p_add_to_balance  boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_person uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above 0.'; end if;
  if not exists (select 1 from cards where id = p_card_id) then raise exception 'Card not found.'; end if;

  if p_person_name is not null and btrim(p_person_name) <> '' and lower(btrim(p_person_name)) <> 'me' then
    v_person := find_or_create_person(p_person_name);
  end if;

  insert into card_uses (card_id, person_id, amount, used_on, reason_or_place, category, due_on)
  values (p_card_id, v_person, p_amount, coalesce(p_used_on, current_date), btrim(p_reason_or_place),
          coalesce(nullif(btrim(p_category), ''), 'Other'), case when v_person is null then null else p_due_on end);

  if p_add_to_balance then
    update cards set balance = balance + p_amount where id = p_card_id;
  end if;

  return v_person;
end;
$$;

-- Records a repayment. Optionally adds it to an account balance and/or lowers a card balance
-- (never below 0).
create or replace function public.record_repayment(
  p_person_id      uuid,
  p_amount         numeric,
  p_applies_to     text,
  p_via            text    default 'Bank transfer',
  p_paid_on        date    default current_date,
  p_card_id        uuid    default null,
  p_account_id     uuid    default null,
  p_add_to_account boolean default false,
  p_lower_card     boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above 0.'; end if;
  if not exists (select 1 from people where id = p_person_id) then raise exception 'Person not found.'; end if;
  if p_card_id is not null and not exists (select 1 from cards where id = p_card_id) then raise exception 'Card not found.'; end if;
  if p_account_id is not null and not exists (select 1 from accounts where id = p_account_id) then raise exception 'Account not found.'; end if;

  insert into repayments (person_id, amount, paid_on, via, applies_to, card_id, account_id)
  values (p_person_id, p_amount, coalesce(p_paid_on, current_date), coalesce(p_via, 'Bank transfer'),
          p_applies_to, p_card_id, p_account_id)
  returning id into v_id;

  if p_add_to_account and p_account_id is not null then
    update accounts set balance = balance + p_amount where id = p_account_id;
  end if;
  if p_lower_card and p_card_id is not null then
    update cards set balance = greatest(balance - p_amount, 0) where id = p_card_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.find_or_create_person(text, text) from public, anon;
revoke all on function public.add_loan(text, numeric, text, date, text, date, uuid, boolean, numeric, text) from public, anon;
revoke all on function public.add_card_use(uuid, text, numeric, text, date, text, date, boolean) from public, anon;
revoke all on function public.record_repayment(uuid, numeric, text, text, date, uuid, uuid, boolean, boolean) from public, anon;

grant execute on function public.find_or_create_person(text, text) to authenticated;
grant execute on function public.add_loan(text, numeric, text, date, text, date, uuid, boolean, numeric, text) to authenticated;
grant execute on function public.add_card_use(uuid, text, numeric, text, date, text, date, boolean) to authenticated;
grant execute on function public.record_repayment(uuid, numeric, text, text, date, uuid, uuid, boolean, boolean) to authenticated;
