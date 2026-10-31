-- Debit card spending: a running "total used" on the bank account, raised one entry at a time.
-- Adds 1 column and 1 function; existing data is not changed.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

alter table public.accounts
  add column debit_used numeric(14,2) not null default 0 check (debit_used >= 0);

create function public.add_debit_use(p_account_id uuid, p_amount numeric)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above 0.'; end if;

  update accounts set debit_used = debit_used + p_amount
  where id = p_account_id
  returning debit_used into v_total;

  if v_total is null then raise exception 'Account not found.'; end if;
  return v_total;
end;
$$;

revoke all on function public.add_debit_use(uuid, numeric) from public, anon;
grant execute on function public.add_debit_use(uuid, numeric) to authenticated;
