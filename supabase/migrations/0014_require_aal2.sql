-- 0014 — The database itself requires two-step sign-in (aal2) for the owner.
--
-- STATUS: NOT APPLIED. Apply order 0010 → 0011 → 0012 → 0013 → 0014, on a Supabase BRANCH first.
--
-- !! BEFORE APPLYING: turn on two-step sign-in in the app (Settings → Two-step sign-in → Add authenticator app) and
-- !! sign in once with a code. After this migration an owner session WITHOUT a code (aal1) reads 0 rows and can
-- !! write nothing, on every finance and research table. If you apply it first, sign in, add the authenticator from
-- !! Settings (enrolment itself doesn't touch these tables), sign out and back in with the code.
--
-- What it does
--   Adds one RESTRICTIVE policy, "require aal2", FOR ALL on each data table. Restrictive policies are ANDed with the
--   existing permissive ones, so nothing is widened: a row is visible/writable only if an existing policy allows it
--   AND the session's JWT says aal = 'aal2'.
--   View mode is unchanged: the shared viewer account has no MFA, so the policy also passes when the caller is a
--   linked viewer (viewed_owner() is not null). On the finance tables that changes nothing (the viewer has no
--   permissive policy there since 0007); on the research tables the viewer keeps its read access, and the existing
--   "viewer no insert/update/delete" restrictive policies still block every viewer write.
--   public.viewers is NOT covered: viewed_owner() reads it for the viewer.
--   Functions stay SECURITY INVOKER, so every RPC (add_loan, record_repayment, …) is covered automatically, and
--   debtor_summary is security_invoker. The audit trigger (SECURITY DEFINER, table owner) is unaffected.
--
-- What it does NOT do: change any row, any grant, or any existing policy.

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'cards', 'people', 'loans', 'card_uses', 'repayments',
    'research_expenses', 'research_contributions',
    'audit_log', 'balance_adjustments'
  ] loop
    execute format('drop policy if exists "require aal2" on public.%I', t);
    execute format(
      'create policy "require aal2" on public.%I as restrictive for all to authenticated
         using ((((select auth.jwt()) ->> ''aal'') = ''aal2'') or ((select public.viewed_owner()) is not null))
         with check ((((select auth.jwt()) ->> ''aal'') = ''aal2'') or ((select public.viewed_owner()) is not null))', t);
  end loop;
end $$;

-- Verify (as the owner, in a rolled-back transaction): supabase/tests/rls_viewer.sql, section "aal1 owner".

-- ---- DOWN (undo) ----------------------------------------------------------------------------------------------------
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['accounts','cards','people','loans','card_uses','repayments',
--                            'research_expenses','research_contributions','audit_log','balance_adjustments'] loop
--     execute format('drop policy if exists "require aal2" on public.%I', t);
--   end loop;
-- end $$;
