-- Integration test of the finance RPCs, run AS THE OWNER inside ONE transaction that is ROLLED BACK.
-- Nothing persists. Safe to run in the SQL Editor (or via the Supabase MCP) against any project with data.
-- Expected: every value in the result is true.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from public.accounts limit 1)::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  acct uuid := (select id from accounts limit 1);
  card uuid := (select id from cards order by slot limit 1);
  b0 numeric; b1 numeric; b2 numeric; b3 numeric; b4 numeric; c0 numeric; c1 numeric; c2 numeric;
  pid uuid; lid uuid; rid uuid; uid uuid; n_before int; n_after int;
  res jsonb := '{}';
begin
  -- 1. loan funded from the bank: balance down by exactly the amount
  select balance into b0 from accounts where id = acct;
  pid := add_loan('ZZ Integration Test', 100, 'integration test', current_date, 'Bank transfer', null, acct, true, 0, null);
  select balance into b1 from accounts where id = acct;
  select id into lid from loans where person_id = pid;
  -- 2. repayment added to the bank: balance up by exactly the amount
  rid := record_repayment(pid, 40, 'loan', 'Cash', current_date, null, acct, true, false);
  select balance into b2 from accounts where id = acct;
  -- 3. delete with undo restores each step exactly
  perform delete_record('repayment', rid, true);
  select balance into b3 from accounts where id = acct;
  perform delete_record('loan', lid, true);
  select balance into b4 from accounts where id = acct;
  res := res || jsonb_build_object('loan_deducts_exactly', b0 - b1 = 100, 'repayment_credits_exactly', b2 - b1 = 40,
                                   'undo_repayment_restores', b3 = b1, 'undo_loan_restores', b4 = b0);

  -- 4. atomicity: a loan that would overdraw the bank fails, and NOTHING from it remains
  select count(*) into n_before from loans;
  begin
    perform add_loan('ZZ Integration Test', b4 + 1000000, 'too big', current_date, 'Bank transfer', null, acct, true, 0, null);
    res := res || '{"overdraft_rejected": false}';
  exception when check_violation then
    res := res || '{"overdraft_rejected": true}';
  end;
  select count(*) into n_after from loans;
  res := res || jsonb_build_object('failed_loan_fully_rolled_back', n_before = n_after,
                                   'bank_unchanged_after_failure', (select balance from accounts where id = acct) = b0);

  -- 5. card purchase (EMI) and card repayment move the CARD only, never the bank
  select balance into c0 from cards where id = card;
  perform add_card_use(card, 'ZZ Integration Test', 600, 'integration test', current_date, 'Other', current_date + 30, true, 'emi', 3);
  select balance into c1 from cards where id = card;
  select id into uid from card_uses where person_id = pid and card_id = card;
  rid := record_repayment(pid, 200, 'card', 'bKash', current_date, card, null, false, true);
  select balance into c2 from cards where id = card;
  res := res || jsonb_build_object('card_purchase_adds_exactly', c1 - c0 = 600, 'card_repayment_lowers_exactly', c1 - c2 = 200,
                                   'bank_untouched_by_card_flows', (select balance from accounts where id = acct) = b0,
                                   'emi_stored', (select pay_plan = 'emi' and emi_months = 3 from card_uses where id = uid));

  -- 6. invalid input is refused by the database itself
  begin
    perform record_repayment(pid, -5, 'loan');
    res := res || '{"negative_repayment_rejected": false}';
  exception when raise_exception then
    res := res || '{"negative_repayment_rejected": true}';
  end;

  perform set_config('test.result', res::text, true);
end $$;

select current_setting('test.result')::jsonb as result;
rollback;
