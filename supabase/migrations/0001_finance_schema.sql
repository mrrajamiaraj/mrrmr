-- ALREADY APPLIED to Supabase project "personal-finance" (ref ksmkrkbqrckxlnehofsb, org "mrmr", region ap-south-1).
-- Kept in the repo for reference only. Do NOT run it again.

create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  holder_name text,
  balance     numeric(14,2) not null default 0 check (balance >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.cards (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slot         smallint not null check (slot in (1, 2)),
  bank         text not null,
  name         text not null,
  network      text,
  last4        text check (last4 ~ '^[0-9]{4}$'),
  credit_limit numeric(14,2) check (credit_limit >= 0),
  balance      numeric(14,2) not null default 0 check (balance >= 0),
  pay_by       date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (owner_id, slot)
);

create table public.people (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  relation   text,
  phone      text,
  notes      text,
  created_at timestamptz not null default now()
);
create unique index people_owner_name_uniq on public.people (owner_id, lower(name));

create table public.loans (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id  uuid not null references public.people(id) on delete restrict,
  account_id uuid references public.accounts(id) on delete set null,
  amount     numeric(14,2) not null check (amount > 0),
  taken_on   date not null default current_date,
  reason     text not null,
  method     text not null default 'Bank transfer'
             check (method in ('Bank transfer','Cash withdrawal','Cheque','bKash from bank')),
  due_on     date,
  created_at timestamptz not null default now()
);

create table public.card_uses (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id         uuid not null references public.cards(id) on delete cascade,
  person_id       uuid references public.people(id) on delete restrict, -- NULL = my own spending
  amount          numeric(14,2) not null check (amount > 0),
  used_on         date not null default current_date,
  reason_or_place text not null,
  category        text not null default 'Other',
  due_on          date,
  created_at      timestamptz not null default now()
);

create table public.repayments (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id  uuid not null references public.people(id) on delete restrict,
  amount     numeric(14,2) not null check (amount > 0),
  paid_on    date not null default current_date,
  via        text not null default 'Bank transfer'
             check (via in ('Bank transfer','Cash','bKash','Nagad')),
  applies_to text not null check (applies_to in ('loan','card')),
  card_id    uuid references public.cards(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  check (applies_to = 'loan' or card_id is not null)
);

-- Indexes on owner_id and every foreign key; updated_at triggers on accounts and cards.
-- RLS enabled on all 6 tables, anon revoked, one policy per table:
--   "owner only" FOR ALL TO authenticated
--   USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()))

-- View public.debtor_summary (security_invoker = true), one row per person:
--   person_id, owner_id, name, relation,
--   loaned, loan_count, card_used, card_use_count,
--   repaid, repaid_loan, repaid_card, repayment_count, last_paid_on,
--   still_owes, next_due,
--   status: 'Repaid' | 'Overdue' | 'Partially Paid' | 'Pending'
--     Repaid  = loaned + card_used - repaid <= 0
--     Overdue = repaid < sum of amounts whose due_on < today
--     Partially Paid = repaid > 0
--     Pending = nothing repaid yet
