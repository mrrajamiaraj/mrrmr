-- RLS verification AS THE VIEWER, inside a transaction that is ROLLED BACK. Nothing persists.
-- Expected: every finance count is 0, research counts are the real numbers, and every write touches 0 rows.
-- (Inserts and RPC calls are tested separately in the SQL Editor because their rejection aborts the transaction:
--   insert into public.research_expenses (facility, member, description, amount) values ('T','T','probe',1);
--     → ERROR 42501 new row violates row-level security policy "viewer no insert"
--   select public.add_loan('probe', 1, 'probe');
--     → ERROR 42501 … policy "viewer no insert" for table "people")
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select viewer_id from public.viewers limit 1)::text, 'role', 'authenticated')::text, true);
set local role authenticated;
with u as (update public.research_expenses set amount = amount + 1 returning 1),
     d as (delete from public.research_contributions returning 1),
     a as (update public.accounts set balance = 0 returning 1),
     c as (update public.cards set balance = 0 returning 1)
select json_build_object(
  'accounts', (select count(*) from public.accounts), 'cards', (select count(*) from public.cards),
  'people', (select count(*) from public.people), 'loans', (select count(*) from public.loans),
  'card_uses', (select count(*) from public.card_uses), 'repayments', (select count(*) from public.repayments),
  'debtor_summary', (select count(*) from public.debtor_summary),
  'research_expenses_visible', (select count(*) from public.research_expenses),
  'research_contributions_visible', (select count(*) from public.research_contributions),
  'research_rows_updated', (select count(*) from u), 'contributions_deleted', (select count(*) from d),
  'accounts_updated', (select count(*) from a), 'cards_updated', (select count(*) from c)
) as viewer_probe;
rollback;
