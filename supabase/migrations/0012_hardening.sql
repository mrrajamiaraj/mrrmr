-- 0012 — Security and integrity hardening (Phase 7).
--
-- STATUS: NOT APPLIED. Requires 0010 (uses card_uses.emi_charges). Apply order: 0010 → 0011 → 0012.
-- Before running: take a backup (Supabase → Database → Backups, or Export CSV in the app) — see docs/SECURITY.md.
--
-- What it does
--   1. Least privilege: the anon role loses EXECUTE on viewed_owner() and touch_updated_at() (neither is needed
--      by signed-out visitors; trigger functions never need caller EXECUTE).
--   2. Index on viewers(owner_id) (Supabase performance advisor: unindexed foreign key).
--   3. Idempotent repayments: repayments.request_id (unique). record_repayment takes p_request_id; a retried or
--      double-submitted form with the same id returns the ORIGINAL repayment and changes nothing — checked inside the
--      same transaction, under the per-person lock, so two concurrent identical submissions can't both insert.
--   4. Date sanity checks (1990-01-01 … 2100-12-31) on every dated column. All existing rows are inside this range
--      (verified 2026-11-19: earliest 2026-03-01, latest 2027-02-28), so the constraints validate immediately.
--
-- What it does NOT do: change any existing row. Undo: see DOWN.

-- ---- 1. least privilege -------------------------------------------------------------------------------------------
revoke execute on function public.viewed_owner() from public, anon;
grant execute on function public.viewed_owner() to authenticated;      -- used inside RLS policies
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- ---- 2. index -----------------------------------------------------------------------------------------------------
create index if not exists viewers_owner_id_idx on public.viewers (owner_id);

-- ---- 3. idempotent repayments -------------------------------------------------------------------------------------
alter table public.repayments add column request_id uuid;
create unique index repayments_request_id_key on public.repayments (request_id) where request_id is not null;

drop function if exists public.record_repayment(uuid, numeric, text, text, date, uuid, uuid, boolean, boolean);

create function public.record_repayment(
  p_person_id uuid, p_amount numeric, p_applies_to text, p_via text default 'Bank transfer',
  p_paid_on date default current_date, p_card_id uuid default null, p_account_id uuid default null,
  p_add_to_account boolean default false, p_lower_card boolean default false, p_request_id uuid default null
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
  if p_add_to_account and (p_account_id is null or p_applies_to <> 'loan') then raise exception 'Only a loan repayment can be added to a bank account.'; end if;
  if not exists (select 1 from people where id = p_person_id) then raise exception 'Person not found.'; end if;
  if p_card_id is not null and not exists (select 1 from cards where id = p_card_id) then raise exception 'Card not found.'; end if;
  if p_account_id is not null and not exists (select 1 from accounts where id = p_account_id) then raise exception 'Account not found.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('mrrmr.record_repayment:' || p_person_id::text, 0));

  -- Idempotency: the same submission (same request id) already recorded → return it, change nothing.
  if p_request_id is not null then
    select id into v_id from repayments where request_id = p_request_id;
    if v_id is not null then return v_id; end if;
  end if;

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

  insert into repayments (person_id, amount, paid_on, via, applies_to, card_id, account_id, request_id)
  values (p_person_id, p_amount, coalesce(p_paid_on, current_date), coalesce(p_via, 'Bank transfer'), p_applies_to, p_card_id, p_account_id, p_request_id)
  returning id into v_id;

  if p_add_to_account then update accounts set balance = balance + p_amount where id = p_account_id; end if;
  if p_lower_card and p_card_id is not null then update cards set balance = greatest(balance - p_amount, 0) where id = p_card_id; end if;
  return v_id;
end;
$$;
revoke all on function public.record_repayment(uuid, numeric, text, text, date, uuid, uuid, boolean, boolean, uuid) from public, anon;
grant execute on function public.record_repayment(uuid, numeric, text, text, date, uuid, uuid, boolean, boolean, uuid) to authenticated;

-- ---- 4. date sanity ---------------------------------------------------------------------------------------------
alter table public.loans
  add constraint loans_taken_on_range check (taken_on between '1990-01-01' and '2100-12-31'),
  add constraint loans_due_on_range check (due_on is null or due_on between '1990-01-01' and '2100-12-31');
alter table public.card_uses
  add constraint card_uses_used_on_range check (used_on between '1990-01-01' and '2100-12-31'),
  add constraint card_uses_due_on_range check (due_on is null or due_on between '1990-01-01' and '2100-12-31');
alter table public.repayments
  add constraint repayments_paid_on_range check (paid_on between '1990-01-01' and '2100-12-31');
alter table public.research_expenses
  add constraint research_expenses_spent_on_range check (spent_on between '1990-01-01' and '2100-12-31');
alter table public.research_contributions
  add constraint research_contributions_paid_on_range check (paid_on between '1990-01-01' and '2100-12-31');

-- ---------------------------------------------------------------------------------------------------------------
-- DOWN (only to undo 0012):
--   drop the 10-argument record_repayment and re-run section 4 of 0010_card_purchases.sql (9-argument version);
--   drop index public.repayments_request_id_key; alter table public.repayments drop column request_id;
--   drop index public.viewers_owner_id_idx;
--   alter table … drop constraint …_range (the seven constraints above);
--   grant execute on function public.viewed_owner() to anon;   (restores the previous, broader grant)
