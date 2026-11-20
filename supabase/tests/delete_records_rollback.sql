-- Test of migration 0013 (delete_records), run AS THE OWNER inside ONE transaction that is ROLLED BACK.
-- Nothing persists — not even the function: it is created inside the transaction when 0013 isn't applied yet.
-- Synthetic person "ZZ Delete Test" only. Expected: every value in the result is true.
begin;

-- 0013's function body (identical to supabase/migrations/0013_delete_records.sql). Harmless if 0013 is applied.
create or replace function public.delete_records(p_items jsonb, p_person_id uuid default null, p_remove_person boolean default false)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_item jsonb; v_kind text; v_id uuid; v_owner uuid; v_n integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Nothing to delete.'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'Too many records at once (500 at most).'; end if;
  if p_person_id is not null then perform pg_advisory_xact_lock(hashtextextended('delete:' || p_person_id::text, 0)); end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_kind := v_item->>'kind'; v_id := (v_item->>'id')::uuid;
    if v_kind not in ('loan', 'card_use', 'repayment') then raise exception 'Unknown record type: %', v_kind; end if;
    if p_person_id is not null then
      select case v_kind when 'loan' then (select person_id from loans where id = v_id)
                         when 'card_use' then (select person_id from card_uses where id = v_id)
                         else (select person_id from repayments where id = v_id) end into v_owner;
      if v_owner is distinct from p_person_id then raise exception 'That record was not found (it may already be deleted).'; end if;
    end if;
    perform delete_record(v_kind, v_id, coalesce((v_item->>'undo')::boolean, false));
    v_n := v_n + 1;
  end loop;
  if p_remove_person then
    if p_person_id is null then raise exception 'Say which person to remove.'; end if;
    if exists (select 1 from loans where person_id = p_person_id) or exists (select 1 from card_uses where person_id = p_person_id)
       or exists (select 1 from repayments where person_id = p_person_id) then
      raise exception 'This person still has records that were not included, so they were not removed.';
    end if;
    delete from people where id = p_person_id;
  end if;
  return v_n;
end; $$;
grant execute on function public.delete_records(jsonb, uuid, boolean) to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from public.accounts limit 1)::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  acct uuid := (select id from accounts limit 1);
  card uuid := (select id from cards order by slot limit 1);
  b0 numeric; c0 numeric; b1 numeric; c1 numeric;
  pid uuid; oid uuid; lid uuid; uid uuid; ouid uuid; r1 uuid; r2 uuid; n int; people0 int;
  res jsonb := '{}';
begin
  select balance into b0 from accounts where id = acct;
  select balance into c0 from cards where id = card;
  select count(*) into people0 from people;

  -- Synthetic history: a bank-funded loan, a card purchase, a loan repayment into the bank, a card repayment.
  pid := add_loan('ZZ Delete Test', 1000, 'synthetic', current_date, 'Bank transfer', null, acct, true, 0, null);
  select id into lid from loans where person_id = pid;
  perform add_card_use(card, 'ZZ Delete Test', 600, 'synthetic', current_date, 'Other', current_date + 30, true);
  select id into uid from card_uses where person_id = pid;
  r1 := record_repayment(pid, 300, 'loan', 'Bank transfer', current_date, null, acct, true, false);
  r2 := record_repayment(pid, 100, 'card', 'Cash', current_date, card, null, false, true);
  -- Another synthetic person's purchase on the same card: must survive.
  oid := find_or_create_person('ZZ Other Test');
  insert into card_uses (card_id, person_id, amount, used_on, reason_or_place) values (card, oid, 50, current_date, 'synthetic') returning id into ouid;

  -- 1. A whole history, mixed answers: reverse the loan and the bank repayment; leave the card purchase/repayment.
  n := delete_records(jsonb_build_array(
         jsonb_build_object('kind', 'loan', 'id', lid, 'undo', true),
         jsonb_build_object('kind', 'card_use', 'id', uid, 'undo', false),
         jsonb_build_object('kind', 'repayment', 'id', r1, 'undo', true),
         jsonb_build_object('kind', 'repayment', 'id', r2, 'undo', false)), pid, true);
  select balance into b1 from accounts where id = acct;
  select balance into c1 from cards where id = card;
  res := res || jsonb_build_object(
    'deleted_four', n = 4,
    'bank_restored_exactly', b1 = b0,                       -- -1000 +300, then +1000 -300
    'card_left_as_answered', c1 = c0 + 600 - 100,            -- "no" = card balance not touched
    'person_removed', not exists (select 1 from people where id = pid),
    'other_persons_purchase_kept', exists (select 1 from card_uses where id = ouid));

  -- 2. Repeating the same request changes nothing and reports not found (the app turns this into "already deleted").
  begin
    perform delete_records(jsonb_build_array(jsonb_build_object('kind', 'loan', 'id', lid, 'undo', true)), null, false);
    res := res || '{"repeat_is_refused": false}';
  exception when raise_exception then
    res := res || jsonb_build_object('repeat_is_refused', true, 'repeat_changed_nothing', (select balance from accounts where id = acct) = b1);
  end;

  -- 3. All or nothing: a batch with one bad id deletes NOTHING.
  begin
    perform delete_records(jsonb_build_array(
      jsonb_build_object('kind', 'card_use', 'id', ouid, 'undo', false),
      jsonb_build_object('kind', 'loan', 'id', gen_random_uuid(), 'undo', false)), null, false);
    res := res || '{"bad_batch_refused": false}';
  exception when raise_exception then
    res := res || jsonb_build_object('bad_batch_refused', true, 'bad_batch_deleted_nothing', exists (select 1 from card_uses where id = ouid));
  end;

  -- 4. Person-scoped: someone else's record can't be slipped into a person's deletion.
  begin
    perform delete_records(jsonb_build_array(jsonb_build_object('kind', 'card_use', 'id', ouid, 'undo', false)), gen_random_uuid(), false);
    res := res || '{"foreign_record_refused": false}';
  exception when raise_exception then
    res := res || '{"foreign_record_refused": true}';
  end;

  perform set_config('test.result', res::text, true);
end $$;

select current_setting('test.result')::jsonb as result;
rollback;
