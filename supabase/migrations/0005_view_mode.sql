-- View mode: a second Supabase user (the "viewer") can READ the owner's data but can never write.
-- Creates 1 new table and 1 function, and adds policies; existing data and policies are not changed.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Then link the viewer to you with the INSERT at the bottom (see README "View mode").

create table public.viewers (
  viewer_id uuid primary key references auth.users(id) on delete cascade,
  owner_id  uuid not null references auth.users(id) on delete cascade,
  check (viewer_id <> owner_id)
);

alter table public.viewers enable row level security;
revoke all on public.viewers from anon;
grant select on public.viewers to authenticated;

-- A viewer can see only its own link row; nobody can change links through the API.
create policy "viewer sees own link" on public.viewers
  for select to authenticated
  using (viewer_id = (select auth.uid()));

-- The owner whose data the signed-in user may view, or NULL for a normal (owner) user.
create function public.viewed_owner()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select owner_id from public.viewers where viewer_id = (select auth.uid())
$$;

grant execute on function public.viewed_owner() to authenticated;

-- For every data table:
--   "viewer read"        lets a viewer SELECT the owner's rows (added to the existing "owner only" policy)
--   "viewer no insert/update/delete"  RESTRICTIVE: any user listed in public.viewers can never write.
-- debtor_summary is security_invoker, so it follows these policies automatically.
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'cards', 'people', 'loans', 'card_uses', 'repayments',
    'research_expenses', 'research_contributions'
  ] loop
    execute format(
      'create policy "viewer read" on public.%I for select to authenticated
         using (owner_id = (select public.viewed_owner()))', t);
    execute format(
      'create policy "viewer no insert" on public.%I as restrictive for insert to authenticated
         with check ((select public.viewed_owner()) is null)', t);
    execute format(
      'create policy "viewer no update" on public.%I as restrictive for update to authenticated
         using ((select public.viewed_owner()) is null)', t);
    execute format(
      'create policy "viewer no delete" on public.%I as restrictive for delete to authenticated
         using ((select public.viewed_owner()) is null)', t);
  end loop;
end $$;

-- After creating the viewer user (Authentication -> Users -> Add user), link it to your account.
-- Replace both emails, then run just this statement:
--
-- insert into public.viewers (viewer_id, owner_id)
-- select v.id, o.id
-- from auth.users v, auth.users o
-- where v.email = 'viewer@example.com'   -- the viewer user (VIEWER_EMAIL)
--   and o.email = 'you@example.com';     -- your own admin login
