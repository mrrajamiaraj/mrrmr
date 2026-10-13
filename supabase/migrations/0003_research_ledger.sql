-- Research Finance Ledger: clinical research expenses and member contributions.
-- Creates 2 NEW tables only. Existing tables are not touched.
-- Same security model as the rest of the app: owner_id defaults to auth.uid(), RLS "owner only",
-- no access for anon.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table public.research_expenses (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  spent_on    date not null default current_date,
  facility    text not null,                 -- BHS, NICVD, United Hospital, BMRC, ...
  member      text not null,                 -- who paid: Raja, Somik, Adnan, ...
  description text not null,
  tag         text,                          -- optional chip, e.g. "Printer Vara", "DVD Recording"
  amount      numeric(14,2) not null check (amount > 0),
  created_at  timestamptz not null default now()
);

create table public.research_contributions (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  paid_on    date not null default current_date,
  member     text not null,
  note       text,                           -- Cash, Bank Transfer, ...
  amount     numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index research_expenses_owner_idx      on public.research_expenses (owner_id, spent_on desc);
create index research_contributions_owner_idx on public.research_contributions (owner_id, paid_on desc);

alter table public.research_expenses      enable row level security;
alter table public.research_contributions enable row level security;

revoke all on public.research_expenses      from anon;
revoke all on public.research_contributions from anon;
grant select, insert, update, delete on public.research_expenses      to authenticated;
grant select, insert, update, delete on public.research_contributions to authenticated;

create policy "owner only" on public.research_expenses
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "owner only" on public.research_contributions
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
