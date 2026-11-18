-- 0009 — Repayment limit enforced inside the database (owner decision 2026-11-19, docs/AUDIT.md §I.2).
--
-- STATUS: NOT APPLIED. Review first, then run once in Supabase → SQL Editor → New query → paste → Run.
--
-- What it does
--   Replaces public.record_repayment with a version that, in the SAME transaction as the insert:
--     1. takes a per-person lock, so two repayments for one person are saved one after the other, never at once;
--     2. refuses a repayment larger than what the person still owes to THAT source:
--          applies_to = 'loan' → their loans − their loan repayments
--          applies_to = 'card' → their uses of that card − their repayments for that card.
--   The app already checks this (lib/actions.ts → owedToSource); this closes the gap where two payments saved at the
--   same moment could both pass the app's check.
--
-- What it does NOT do
--   No table is created, altered or written. No existing row changes. Same name, same parameters, same return value,
--   same SECURITY INVOKER (RLS still applies), same grants. Balance effects (add to account / lower card) are identical.
--   add_loan's "initial repaid" is not affected (it is already limited to the loan amount).
--
-- Undo: run the DOWN block at the bottom (it restores the 0002 version exactly).

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
  v_id    uuid;
  v_taken numeric;
  v_paid  numeric;
  v_owed  numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above 0.'; end if;
  if p_applies_to is null or p_applies_to not in ('loan', 'card') then raise exception 'Pick what this repayment is for.'; end if;
  if p_applies_to = 'card' and p_card_id is null then raise exception 'Pick which card this repayment is for.'; end if;
  if not exists (select 1 from people where id = p_person_id) then raise exception 'Person not found.'; end if;
  if p_card_id is not null and not exists (select 1 from cards where id = p_card_id) then raise exception 'Card not found.'; end if;
  if p_account_id is not null and not exists (select 1 from accounts where id = p_account_id) then raise exception 'Account not found.'; end if;

  -- One repayment per person at a time; released automatically at commit/rollback. Under READ COMMITTED the sums
  -- below run after the lock is held, so they see any repayment the previous holder just committed.
  perform pg_advisory_xact_lock(hashtextextended('mrrmr.record_repayment:' || p_person_id::text, 0));

  if p_applies_to = 'loan' then
    select coalesce(sum(amount), 0) into v_taken from loans where person_id = p_person_id;
    select coalesce(sum(amount), 0) into v_paid  from repayments where person_id = p_person_id and applies_to = 'loan';
  else
    select coalesce(sum(amount), 0) into v_taken from card_uses where person_id = p_person_id and card_id = p_card_id;
    select coalesce(sum(amount), 0) into v_paid  from repayments where person_id = p_person_id and applies_to = 'card' and card_id = p_card_id;
  end if;
  v_owed := greatest(v_taken - v_paid, 0);

  if p_amount > v_owed then
    if v_owed = 0 then
      raise exception 'They owe nothing %.', case when p_applies_to = 'loan' then 'on loans' else 'for that card' end;
    end if;
    raise exception 'They only owe ৳% %.', to_char(v_owed, 'FM999999999990.00'),
      case when p_applies_to = 'loan' then 'on loans' else 'for that card' end;
  end if;

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

-- CREATE OR REPLACE keeps existing grants; restated so the file is self-contained.
revoke all on function public.record_repayment(uuid, numeric, text, text, date, uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.record_repayment(uuid, numeric, text, text, date, uuid, uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- DOWN (only if you need to undo 0009): restores the 0002 version exactly. Copy from "create or replace" to "$$;".
--
-- create or replace function public.record_repayment(
--   p_person_id uuid, p_amount numeric, p_applies_to text, p_via text default 'Bank transfer',
--   p_paid_on date default current_date, p_card_id uuid default null, p_account_id uuid default null,
--   p_add_to_account boolean default false, p_lower_card boolean default false
-- ) returns uuid language plpgsql security invoker set search_path = public as $$
-- declare v_id uuid;
-- begin
--   if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above 0.'; end if;
--   if not exists (select 1 from people where id = p_person_id) then raise exception 'Person not found.'; end if;
--   if p_card_id is not null and not exists (select 1 from cards where id = p_card_id) then raise exception 'Card not found.'; end if;
--   if p_account_id is not null and not exists (select 1 from accounts where id = p_account_id) then raise exception 'Account not found.'; end if;
--   insert into repayments (person_id, amount, paid_on, via, applies_to, card_id, account_id)
--   values (p_person_id, p_amount, coalesce(p_paid_on, current_date), coalesce(p_via, 'Bank transfer'),
--           p_applies_to, p_card_id, p_account_id)
--   returning id into v_id;
--   if p_add_to_account and p_account_id is not null then
--     update accounts set balance = balance + p_amount where id = p_account_id;
--   end if;
--   if p_lower_card and p_card_id is not null then
--     update cards set balance = greatest(balance - p_amount, 0) where id = p_card_id;
--   end if;
--   return v_id;
-- end;
-- $$;
