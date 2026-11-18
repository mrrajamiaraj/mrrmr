-- 0010 — Split card purchases and EMI charges (owner decisions 2026-11-19, docs/AUDIT.md §I and Phase 4).
--
-- STATUS: NOT APPLIED. Review first, then run once in Supabase → SQL Editor → New query → paste → Run.
-- It can be run with or without 0009 (it includes 0009's protection).
--
-- What it does
--   1. card_uses gets two columns. Every existing row gets the default, so NO existing figure changes:
--        emi_charges     numeric(14,2) default 0 — interest / processing fee from your card statement for an EMI share.
--                        The BUYER owes them: they are added to what that person owes and spread over their installments.
--                        They are NOT added to the card balance here (they reach the card balance when the issuer
--                        bills them — update the card balance from your statement then).
--        purchase_group  uuid, null — links the shares of one split purchase (one receipt, several payers).
--   2. New function add_card_purchase(...): records a purchase with one or more payers (you and/or others),
--      each with its own amount, plan (full / EMI), first due date and EMI charges, and adds the total to the card
--      balance if asked — all in ONE transaction. SECURITY INVOKER, so RLS and the viewer restrictions still apply.
--   3. debtor_summary: what people owe on cards now includes emi_charges (amount + emi_charges).
--   4. record_repayment: the per-source repayment limit (0009) under a per-person lock, now counting emi_charges.
--
-- What it does NOT do
--   No row is updated or deleted. add_card_use, add_loan, delete_record and every policy are unchanged.
--   Deleting one share of a split purchase deletes only that share (delete_record is unchanged).
--
-- Undo: see the DOWN block at the bottom.

-- ---- 1. columns ----------------------------------------------------------------------------------------------
alter table public.card_uses
  add column emi_charges    numeric(14,2) not null default 0 check (emi_charges >= 0),
  add column purchase_group uuid,
  -- Charges only ever belong to EMI shares.
  add constraint card_uses_charges_emi_only check (pay_plan = 'emi' or emi_charges = 0);

create index card_uses_purchase_group_idx on public.card_uses (purchase_group) where purchase_group is not null;

-- ---- 2. atomic multi-payer purchase ---------------------------------------------------------------------------
-- p_parts: [{ "name": "Me" | "<person>", "amount": 1000, "plan": "full"|"emi", "emi_months": 6,
--             "due_on": "2026-12-30", "emi_charges": 120 }, ...]   (1–10 parts)
create function public.add_card_purchase(
  p_card_id        uuid,
  p_reason         text,
  p_used_on        date    default current_date,
  p_category       text    default 'Other',
  p_add_to_balance boolean default true,
  p_parts          jsonb   default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group   uuid := gen_random_uuid();
  v_count   int;
  v_part    jsonb;
  v_name    text;
  v_amount  numeric;
  v_plan    text;
  v_months  int;
  v_due     date;
  v_charges numeric;
  v_person  uuid;
  v_total   numeric := 0;
begin
  if not exists (select 1 from cards where id = p_card_id) then raise exception 'Card not found.'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'Enter why or where the card was used.'; end if;
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' then raise exception 'Add who pays for this purchase.'; end if;
  v_count := jsonb_array_length(p_parts);
  if v_count < 1 or v_count > 10 then raise exception 'A purchase can have 1 to 10 payers.'; end if;

  for v_part in select value from jsonb_array_elements(p_parts) loop
    v_name    := btrim(coalesce(v_part->>'name', ''));
    v_amount  := round((v_part->>'amount')::numeric, 2);
    v_plan    := coalesce(nullif(v_part->>'plan', ''), 'full');
    v_months  := nullif(v_part->>'emi_months', '')::int;
    v_due     := nullif(v_part->>'due_on', '')::date;
    v_charges := round(coalesce(nullif(v_part->>'emi_charges', '')::numeric, 0), 2);

    if v_name = '' then raise exception 'Enter who pays each share (or "Me").'; end if;
    if v_amount is null or v_amount <= 0 then raise exception 'Each share must be above ৳0.'; end if;
    if v_charges < 0 then raise exception 'EMI charges can''t be negative.'; end if;
    if v_plan not in ('full', 'emi') then raise exception 'Pick full payment or EMI.'; end if;

    v_person := null;
    if lower(v_name) <> 'me' then v_person := find_or_create_person(v_name); end if;

    if v_person is null then
      -- Your own share: always "full", no due date, no charges (you don't owe yourself).
      v_plan := 'full'; v_months := null; v_due := null; v_charges := 0;
    elsif v_plan = 'emi' then
      if v_months is null or v_months < 2 or v_months > 60 then raise exception 'Pick how many months the EMI runs.'; end if;
      if v_due is null then raise exception 'Pick the first installment date.'; end if;
    else
      v_months := null;
      if v_charges > 0 then raise exception 'Charges apply to EMI shares only.'; end if;
    end if;

    insert into card_uses (card_id, person_id, amount, used_on, reason_or_place, category, due_on,
                           pay_plan, emi_months, emi_charges, purchase_group)
    values (p_card_id, v_person, v_amount, coalesce(p_used_on, current_date), btrim(p_reason),
            coalesce(nullif(btrim(p_category), ''), 'Other'), v_due,
            v_plan, v_months, v_charges, case when v_count > 1 then v_group end);

    v_total := v_total + v_amount;
  end loop;

  if p_add_to_balance then
    update cards set balance = balance + v_total where id = p_card_id;
  end if;

  return v_group;
end;
$$;

revoke all on function public.add_card_purchase(uuid, text, date, text, boolean, jsonb) from public, anon;
grant execute on function public.add_card_purchase(uuid, text, date, text, boolean, jsonb) to authenticated;

-- ---- 3. debtor_summary: card debt includes EMI charges --------------------------------------------------------
-- Same definition as live, except card_used / past_due use (amount + emi_charges). security_invoker is kept.
create or replace view public.debtor_summary with (security_invoker = true) as
 with l as (
         select loans.person_id, sum(loans.amount) as loaned, count(*) as loan_count,
            sum(loans.amount) filter (where loans.due_on < current_date) as past_due,
            min(loans.due_on) filter (where loans.due_on >= current_date) as next_due
           from loans group by loans.person_id
        ), cu as (
         select card_uses.person_id, sum(card_uses.amount + card_uses.emi_charges) as card_used, count(*) as card_use_count,
            sum(card_uses.amount + card_uses.emi_charges) filter (where card_uses.due_on < current_date) as past_due,
            min(card_uses.due_on) filter (where card_uses.due_on >= current_date) as next_due
           from card_uses where card_uses.person_id is not null group by card_uses.person_id
        ), r as (
         select repayments.person_id, sum(repayments.amount) as repaid,
            sum(repayments.amount) filter (where repayments.applies_to = 'loan') as repaid_loan,
            sum(repayments.amount) filter (where repayments.applies_to = 'card') as repaid_card,
            count(*) as repayment_count, max(repayments.paid_on) as last_paid_on
           from repayments group by repayments.person_id
        )
 select p.id as person_id, p.owner_id, p.name, p.relation,
    coalesce(l.loaned, 0::numeric) as loaned, coalesce(l.loan_count, 0::bigint) as loan_count,
    coalesce(cu.card_used, 0::numeric) as card_used, coalesce(cu.card_use_count, 0::bigint) as card_use_count,
    coalesce(r.repaid, 0::numeric) as repaid, coalesce(r.repaid_loan, 0::numeric) as repaid_loan,
    coalesce(r.repaid_card, 0::numeric) as repaid_card, coalesce(r.repayment_count, 0::bigint) as repayment_count,
    r.last_paid_on,
    greatest(coalesce(l.loaned, 0::numeric) + coalesce(cu.card_used, 0::numeric) - coalesce(r.repaid, 0::numeric), 0::numeric) as still_owes,
    least(l.next_due, cu.next_due) as next_due,
        case
            when (coalesce(l.loaned, 0::numeric) + coalesce(cu.card_used, 0::numeric) - coalesce(r.repaid, 0::numeric)) <= 0::numeric then 'Repaid'
            when coalesce(r.repaid, 0::numeric) < (coalesce(l.past_due, 0::numeric) + coalesce(cu.past_due, 0::numeric)) then 'Overdue'
            when coalesce(r.repaid, 0::numeric) > 0::numeric then 'Partially Paid'
            else 'Pending'
        end as status
   from people p
     left join l on l.person_id = p.id
     left join cu on cu.person_id = p.id
     left join r on r.person_id = p.id;

-- ---- 4. record_repayment: per-source limit under a per-person lock, counting EMI charges -------------------------
create or replace function public.record_repayment(
  p_person_id uuid, p_amount numeric, p_applies_to text, p_via text default 'Bank transfer',
  p_paid_on date default current_date, p_card_id uuid default null, p_account_id uuid default null,
  p_add_to_account boolean default false, p_lower_card boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid; v_taken numeric; v_paid numeric; v_owed numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above 0.'; end if;
  if p_applies_to is null or p_applies_to not in ('loan', 'card') then raise exception 'Pick what this repayment is for.'; end if;
  if p_applies_to = 'card' and p_card_id is null then raise exception 'Pick which card this repayment is for.'; end if;
  if not exists (select 1 from people where id = p_person_id) then raise exception 'Person not found.'; end if;
  if p_card_id is not null and not exists (select 1 from cards where id = p_card_id) then raise exception 'Card not found.'; end if;
  if p_account_id is not null and not exists (select 1 from accounts where id = p_account_id) then raise exception 'Account not found.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('mrrmr.record_repayment:' || p_person_id::text, 0));

  if p_applies_to = 'loan' then
    select coalesce(sum(amount), 0) into v_taken from loans where person_id = p_person_id;
    select coalesce(sum(amount), 0) into v_paid from repayments where person_id = p_person_id and applies_to = 'loan';
  else
    select coalesce(sum(amount + emi_charges), 0) into v_taken from card_uses where person_id = p_person_id and card_id = p_card_id;
    select coalesce(sum(amount), 0) into v_paid from repayments where person_id = p_person_id and applies_to = 'card' and card_id = p_card_id;
  end if;
  v_owed := greatest(v_taken - v_paid, 0);
  if p_amount > v_owed then
    if v_owed = 0 then raise exception 'They owe nothing %.', case when p_applies_to = 'loan' then 'on loans' else 'for that card' end; end if;
    raise exception 'They only owe ৳% %.', to_char(v_owed, 'FM999999999990.00'), case when p_applies_to = 'loan' then 'on loans' else 'for that card' end;
  end if;

  insert into repayments (person_id, amount, paid_on, via, applies_to, card_id, account_id)
  values (p_person_id, p_amount, coalesce(p_paid_on, current_date), coalesce(p_via, 'Bank transfer'), p_applies_to, p_card_id, p_account_id)
  returning id into v_id;

  if p_add_to_account and p_account_id is not null then update accounts set balance = balance + p_amount where id = p_account_id; end if;
  if p_lower_card and p_card_id is not null then update cards set balance = greatest(balance - p_amount, 0) where id = p_card_id; end if;
  return v_id;
end;
$$;

revoke all on function public.record_repayment(uuid, numeric, text, text, date, uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.record_repayment(uuid, numeric, text, text, date, uuid, uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- DOWN (only to undo 0010). Run in this order:
--   1. Restore the view from the live definition before 0010 (same SQL as section 3 above, but with
--      "sum(card_uses.amount)" in place of "sum(card_uses.amount + card_uses.emi_charges)" in both places).
--   2. Restore record_repayment from 0009_repayment_limit.sql (or its DOWN block for the original 0002 version).
--   3. drop function public.add_card_purchase(uuid, text, date, text, boolean, jsonb);
--   4. drop index public.card_uses_purchase_group_idx;
--      alter table public.card_uses drop constraint card_uses_charges_emi_only,
--        drop column purchase_group, drop column emi_charges;
--      WARNING: step 4 permanently discards any EMI charges and split links recorded after 0010. Export a CSV first.
