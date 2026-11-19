-- 0013 — Atomic multi-record deletion (portfolio redesign).
--
-- STATUS: written for review. Independent of 0009–0012 (needs only 0004's delete_record). Additive: creates ONE
-- function, changes no table and no row. Undo: see DOWN.
--
-- Why: "Delete all of a person's history" used to call delete_record once per entry from the app, so a failure half
-- way left some entries deleted and some not. delete_records runs every deletion — and every balance reversal the
-- admin confirmed — in ONE transaction: all of it happens, or none of it does.
--
-- p_items: [{"kind": "loan"|"card_use"|"repayment", "id": "<uuid>", "undo": true|false}, ...]  (1–500 items)
--   undo = reverse that entry's effect on its linked bank or card balance (exactly as delete_record does).
-- p_person_id: when given, every item must belong to that person. Other people's records — including other shares
--   of a split purchase — are never touched.
-- p_remove_person: also remove the person from the list (only once they have no records left).
--
-- SECURITY INVOKER: the existing "owner only" RLS policies apply, and the restrictive "viewer no delete" policies
-- still block view mode. A record you can't see can't be deleted (it reports "not found" and nothing changes).

create or replace function public.delete_records(p_items jsonb, p_person_id uuid default null, p_remove_person boolean default false)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item  jsonb;
  v_kind  text;
  v_id    uuid;
  v_owner uuid;
  v_n     integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Nothing to delete.'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'Too many records at once (500 at most).'; end if;

  -- One person's history is deleted by one session at a time (a double-click waits, then finds nothing left).
  if p_person_id is not null then perform pg_advisory_xact_lock(hashtextextended('delete:' || p_person_id::text, 0)); end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_kind := v_item->>'kind';
    v_id   := (v_item->>'id')::uuid;
    if v_kind not in ('loan', 'card_use', 'repayment') then raise exception 'Unknown record type: %', v_kind; end if;

    if p_person_id is not null then
      select case v_kind
               when 'loan'      then (select person_id from loans      where id = v_id)
               when 'card_use'  then (select person_id from card_uses  where id = v_id)
               else                  (select person_id from repayments where id = v_id) end
        into v_owner;
      if v_owner is distinct from p_person_id then raise exception 'That record was not found (it may already be deleted).'; end if;
    end if;

    perform delete_record(v_kind, v_id, coalesce((v_item->>'undo')::boolean, false));
    v_n := v_n + 1;
  end loop;

  if p_remove_person then
    if p_person_id is null then raise exception 'Say which person to remove.'; end if;
    if exists (select 1 from loans where person_id = p_person_id)
       or exists (select 1 from card_uses where person_id = p_person_id)
       or exists (select 1 from repayments where person_id = p_person_id) then
      raise exception 'This person still has records that were not included, so they were not removed.';
    end if;
    delete from people where id = p_person_id;
  end if;

  return v_n;
end;
$$;

revoke all on function public.delete_records(jsonb, uuid, boolean) from public, anon;
grant execute on function public.delete_records(jsonb, uuid, boolean) to authenticated;

-- ---- DOWN ---------------------------------------------------------------------------------------------------------
-- drop function if exists public.delete_records(jsonb, uuid, boolean);
