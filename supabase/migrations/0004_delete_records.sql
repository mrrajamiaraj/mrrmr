-- Permanently deletes one history record (a loan, a card use or a repayment) and, if asked,
-- undoes what it did to the bank or card balance — both in ONE transaction.
-- Creates a function only: no tables are created or altered.
-- SECURITY INVOKER, so the existing "owner only" RLS policies still apply: you can only delete your own rows.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create or replace function public.delete_record(
  p_kind         text,     -- 'loan' | 'card_use' | 'repayment'
  p_id           uuid,
  p_undo_balance boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_amount     numeric;
  v_account    uuid;
  v_card       uuid;
  v_applies_to text;
begin
  if p_kind = 'loan' then
    delete from loans where id = p_id returning amount, account_id into v_amount, v_account;
    if v_amount is null then raise exception 'That record was not found (it may already be deleted).'; end if;
    -- The loan took money out of the account, so give it back.
    if p_undo_balance and v_account is not null then
      update accounts set balance = balance + v_amount where id = v_account;
    end if;

  elsif p_kind = 'card_use' then
    delete from card_uses where id = p_id returning amount, card_id into v_amount, v_card;
    if v_amount is null then raise exception 'That record was not found (it may already be deleted).'; end if;
    -- The use was added to the card balance, so take it off again (never below 0).
    if p_undo_balance then
      update cards set balance = greatest(balance - v_amount, 0) where id = v_card;
    end if;

  elsif p_kind = 'repayment' then
    delete from repayments where id = p_id
      returning amount, applies_to, account_id, card_id into v_amount, v_applies_to, v_account, v_card;
    if v_amount is null then raise exception 'That record was not found (it may already be deleted).'; end if;
    if p_undo_balance then
      if v_applies_to = 'loan' and v_account is not null then
        -- The repayment went into the account, so take it back out.
        update accounts set balance = balance - v_amount where id = v_account;
      elsif v_applies_to = 'card' and v_card is not null then
        -- The repayment lowered the card balance, so put it back.
        update cards set balance = balance + v_amount where id = v_card;
      end if;
    end if;

  else
    raise exception 'Unknown record type: %', p_kind;
  end if;
end;
$$;

revoke all on function public.delete_record(text, uuid, boolean) from public, anon;
grant execute on function public.delete_record(text, uuid, boolean) to authenticated;
