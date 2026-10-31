-- View mode sees Research Finance only.
-- Removes the "viewer read" policies 0005 added to the personal-finance tables; the research tables keep theirs.
-- The owner's own access and every "viewer no insert/update/delete" policy are not changed.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'cards', 'people', 'loans', 'card_uses', 'repayments'] loop
    execute format('drop policy if exists "viewer read" on public.%I', t);
  end loop;
end $$;
