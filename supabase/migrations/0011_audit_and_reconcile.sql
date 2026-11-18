-- 0011 — Append-only audit trail and traceable reconciliation adjustments (Phase 6, features 5 and 6).
--
-- STATUS: NOT APPLIED. Review first, then run once in Supabase → SQL Editor → New query → paste → Run.
-- Independent of 0009/0010 (apply in any order).
--
-- What it does
--   1. public.audit_log — one row per insert/update/delete on every finance and research table, with the actor
--      (auth.uid()), the time, and the row before and after (as JSON). Written ONLY by a SECURITY DEFINER trigger:
--      app users can READ their own entries and nothing else (no insert/update/delete grant at all), so audit rows
--      can't be changed or removed from the client. Manual balance edits become traceable automatically.
--   2. public.balance_adjustments — when you reconcile the bank or a card against a statement, the recorded figure,
--      the statement figure and the difference are stored as a permanent row (append-only: no update/delete grant).
--   3. public.reconcile_balance(...) — records that adjustment AND sets the balance to the statement figure in ONE
--      transaction, with the row locked. SECURITY INVOKER: owner-only RLS and the viewer restrictions apply.
--
-- What it does NOT do: no existing row is changed. History starts when this runs (earlier changes weren't captured).
-- Undo: see DOWN at the bottom.

-- ---- 1. audit log ----------------------------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  owner_id    uuid,
  actor_id    uuid,
  at          timestamptz not null default now(),
  action      text not null check (action in ('insert', 'update', 'delete')),
  table_name  text not null,
  row_id      uuid,
  before      jsonb,
  after       jsonb
);
create index audit_log_owner_at_idx on public.audit_log (owner_id, at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;
-- The owner reads their own trail. The viewer is not the owner, so it reads nothing.
create policy "owner reads audit" on public.audit_log for select to authenticated using (owner_id = (select auth.uid()));

create function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log (owner_id, actor_id, action, table_name, row_id, before, after)
    values (old.owner_id, auth.uid(), 'delete', tg_table_name, old.id, to_jsonb(old), null);
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (owner_id, actor_id, action, table_name, row_id, before, after)
    values (new.owner_id, auth.uid(), 'update', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
  else
    insert into public.audit_log (owner_id, actor_id, action, table_name, row_id, before, after)
    values (new.owner_id, auth.uid(), 'insert', tg_table_name, new.id, null, to_jsonb(new));
  end if;
  return null;
end;
$$;
revoke all on function public.audit_trigger() from public, anon, authenticated;

-- ---- 2. balance adjustments ------------------------------------------------------------------------------------
create table public.balance_adjustments (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target         text not null check (target in ('account', 'card')),
  target_id      uuid not null,
  recorded       numeric(14,2) not null,
  statement      numeric(14,2) not null check (statement >= 0),
  delta          numeric(14,2) not null,
  statement_date date not null,
  note           text,
  created_at     timestamptz not null default now(),
  check (delta = statement - recorded)
);
create index balance_adjustments_owner_idx on public.balance_adjustments (owner_id, created_at desc);

alter table public.balance_adjustments enable row level security;
revoke all on public.balance_adjustments from public, anon;
grant select, insert on public.balance_adjustments to authenticated;   -- no update, no delete: append-only
create policy "owner only" on public.balance_adjustments for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "viewer no insert" on public.balance_adjustments as restrictive for insert to authenticated
  with check ((select public.viewed_owner()) is null);

-- ---- 3. reconcile in one transaction ------------------------------------------------------------------------------
create function public.reconcile_balance(
  p_target         text,
  p_id             uuid,
  p_statement      numeric,
  p_statement_date date default current_date,
  p_note           text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_recorded numeric;
  v_id       uuid;
begin
  if p_statement is null or p_statement < 0 then raise exception 'Enter the statement figure (0 or more).'; end if;
  if p_target = 'account' then
    select balance into v_recorded from accounts where id = p_id for update;
  elsif p_target = 'card' then
    select balance into v_recorded from cards where id = p_id for update;
  else
    raise exception 'Pick the bank account or a card.';
  end if;
  if v_recorded is null then raise exception 'Account or card not found.'; end if;
  if round(p_statement, 2) = v_recorded then raise exception 'The statement matches the recorded figure — nothing to adjust.'; end if;

  insert into balance_adjustments (target, target_id, recorded, statement, delta, statement_date, note)
  values (p_target, p_id, v_recorded, round(p_statement, 2), round(p_statement, 2) - v_recorded,
          coalesce(p_statement_date, current_date), nullif(btrim(p_note), ''))
  returning id into v_id;

  if p_target = 'account' then update accounts set balance = round(p_statement, 2) where id = p_id;
  else update cards set balance = round(p_statement, 2) where id = p_id; end if;
  return v_id;
end;
$$;
revoke all on function public.reconcile_balance(text, uuid, numeric, date, text) from public, anon;
grant execute on function public.reconcile_balance(text, uuid, numeric, date, text) to authenticated;

-- ---- 4. attach the audit trigger ----------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['accounts', 'cards', 'people', 'loans', 'card_uses', 'repayments',
                           'research_expenses', 'research_contributions', 'balance_adjustments'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- DOWN (only to undo 0011):
--   do $$ declare t text; begin foreach t in array array['accounts','cards','people','loans','card_uses','repayments',
--     'research_expenses','research_contributions','balance_adjustments'] loop
--     execute format('drop trigger if exists audit_%1$s on public.%1$I', t); end loop; end $$;
--   drop function public.reconcile_balance(text, uuid, numeric, date, text);
--   drop function public.audit_trigger();
--   drop table public.balance_adjustments;   -- WARNING: discards recorded adjustments (export first)
--   drop table public.audit_log;             -- WARNING: discards the audit trail (export first)
