-- Synthetic demo data for MRRMR — for visual review, screenshots and destructive-flow testing ONLY.
-- Every name, amount and card number here is invented. Run in the SQL Editor after replacing DEMO_EMAIL below
-- with the demo user's email. It writes ONLY rows owned by that user (owner_id), so the owner-only RLS policies keep
-- them invisible to every other account, and it refuses to run if that user already has data.
-- Remove it all later with: delete from auth.users where email = 'DEMO_EMAIL';  (owner_id cascades)

do $$
declare
  v_owner uuid := (select id from auth.users where email = 'DEMO_EMAIL');
  acct uuid; c1 uuid; c2 uuid; p uuid; u uuid;
  names text[] := array['Tanvir Ahmed','Nusrat Jahan','Rafiq Islam','Farhana Akter','Sabbir Hossain','Mehedi Hasan',
                        'Sharmin Sultana','Imran Chowdhury','Ayesha Rahman','Mohammad Abdullah Al Mamun Chowdhury Khan'];
  ids uuid[] := '{}';
  i int; d date := current_date;
begin
  if v_owner is null then raise exception 'No user with that email — create the demo user first.'; end if;
  if exists (select 1 from accounts where owner_id = v_owner) then raise exception 'The demo user already has data; nothing was changed.'; end if;
  if v_owner = (select owner_id from accounts order by created_at limit 1) then raise exception 'That is the main account. Use a separate demo user.'; end if;

  insert into accounts (owner_id, name, holder_name, balance, debit_used) values (v_owner, 'City Bank', 'Demo Holder', 184250.00, 23640.00) returning id into acct;
  insert into cards (owner_id, slot, bank, name, network, last4, credit_limit, balance, pay_by)
    values (v_owner, 1, 'City Bank', 'DEMO HOLDER', 'Amex Blue', '4821', 300000, 118430.00, d + 9) returning id into c1;
  insert into cards (owner_id, slot, bank, name, network, last4, credit_limit, balance, pay_by)
    values (v_owner, 2, 'Community Bank', 'DEMO HOLDER', 'Visa Platinum', '7310', 200000, 46900.00, d - 3) returning id into c2;

  for i in 1 .. array_length(names, 1) loop
    insert into people (owner_id, name, relation, phone) values (v_owner, names[i],
      (array['Friend','Cousin','Colleague','Neighbour','Friend','Colleague','Sister-in-law','Friend','Cousin','Office'])[i],
      case when i % 3 = 0 then null else '01' || (700000000 + i * 1234567)::text end) returning id into p;
    ids := ids || p;
  end loop;

  -- Tanvir: a long history (multi-page PDF): monthly loans and repayments over two years.
  for i in 0 .. 23 loop
    insert into loans (owner_id, person_id, account_id, amount, taken_on, reason, method, due_on)
      values (v_owner, ids[1], acct, 2500 + (i % 5) * 750, d - (720 - i * 30), (array['Rent','Medicine','Bus fare','Phone bill','Groceries'])[1 + i % 5],
              (array['Bank transfer','bKash from bank','Cash withdrawal'])[1 + i % 3], d - (690 - i * 30));
    insert into repayments (owner_id, person_id, amount, paid_on, via, applies_to, account_id)
      values (v_owner, ids[1], 2000 + (i % 4) * 500, d - (700 - i * 30), (array['Bank transfer','Cash','bKash','Nagad'])[1 + i % 4], 'loan',
              case when i % 4 = 0 then acct else null end);
  end loop;

  -- Nusrat: an EMI phone on the City Bank card (6 months), two installments paid; overdue next one.
  insert into card_uses (owner_id, card_id, person_id, amount, used_on, reason_or_place, category, due_on, pay_plan, emi_months)
    values (v_owner, c1, ids[2], 42000, d - 100, 'Samsung phone · Bashundhara City', 'Electronics', d - 80, 'emi', 6);
  insert into repayments (owner_id, person_id, amount, paid_on, via, applies_to, card_id) values
    (v_owner, ids[2], 7000, d - 78, 'bKash', 'card', c1), (v_owner, ids[2], 7000, d - 47, 'bKash', 'card', c1);

  -- Rafiq: bank loan due this week, partly repaid.
  insert into loans (owner_id, person_id, account_id, amount, taken_on, reason, method, due_on) values (v_owner, ids[3], acct, 15000, d - 40, 'Laptop repair', 'Bank transfer', d + 4);
  insert into repayments (owner_id, person_id, amount, paid_on, via, applies_to, account_id) values (v_owner, ids[3], 5000, d - 12, 'Bank transfer', 'loan', acct);

  -- Farhana: a split purchase (she and I share a fridge on the Community card) + a full-payment purchase.
  u := gen_random_uuid();
  insert into card_uses (owner_id, card_id, person_id, amount, used_on, reason_or_place, category, due_on, pay_plan, emi_months)
    values (v_owner, c2, ids[4], 36000, d - 25, 'Refrigerator · Walton Plaza', 'Electronics', d + 5, 'emi', 3),
           (v_owner, c2, null, 12000, d - 25, 'Refrigerator · Walton Plaza', 'Electronics', null, 'full', null),
           (v_owner, c2, ids[4], 3400, d - 9, 'Dinner · Gulshan', 'Food', d + 21, 'full', null);
  begin
    update card_uses set purchase_group = u where owner_id = v_owner and reason_or_place = 'Refrigerator · Walton Plaza';
  exception when undefined_column then null; -- before migration 0010 there is no purchase_group
  end;

  -- Sabbir: repaid in full.
  insert into loans (owner_id, person_id, account_id, amount, taken_on, reason, method, due_on) values (v_owner, ids[5], acct, 8000, d - 150, 'Wedding gift', 'Cash withdrawal', d - 90);
  insert into repayments (owner_id, person_id, amount, paid_on, via, applies_to, account_id) values (v_owner, ids[5], 8000, d - 95, 'Cash', 'loan', null);

  -- Mehedi: overdue bank loan, nothing repaid.
  insert into loans (owner_id, person_id, account_id, amount, taken_on, reason, method, due_on) values (v_owner, ids[6], acct, 22000, d - 75, 'Hospital deposit', 'Bank transfer', d - 20);

  -- Sharmin: 12-month EMI on the City card, on schedule.
  insert into card_uses (owner_id, card_id, person_id, amount, used_on, reason_or_place, category, due_on, pay_plan, emi_months)
    values (v_owner, c1, ids[7], 60000, d - 70, 'Air conditioner · Transcom', 'Electronics', d - 50, 'emi', 12);
  insert into repayments (owner_id, person_id, amount, paid_on, via, applies_to, card_id) values
    (v_owner, ids[7], 5000, d - 50, 'Bank transfer', 'card', c1), (v_owner, ids[7], 5000, d - 20, 'Bank transfer', 'card', c1);

  -- Imran: no due date set; Ayesha: several small things this month.
  insert into loans (owner_id, person_id, account_id, amount, taken_on, reason, method) values (v_owner, ids[8], acct, 4500, d - 33, 'Exam fee', 'bKash from bank');
  insert into loans (owner_id, person_id, account_id, amount, taken_on, reason, method, due_on) values (v_owner, ids[9], acct, 1200, d - 6, 'Rickshaw and lunch', 'Cash withdrawal', d + 10);
  insert into card_uses (owner_id, card_id, person_id, amount, used_on, reason_or_place, category, due_on)
    values (v_owner, c1, ids[9], 2750.50, d - 4, 'Books · Nilkhet', 'Shopping', d + 12);

  -- Very long name + very large amount (layout stress test).
  insert into loans (owner_id, person_id, account_id, amount, taken_on, reason, method, due_on)
    values (v_owner, ids[10], acct, 12500000.75, d - 60, 'Business investment with a deliberately long description to test wrapping', 'Cheque', d + 60);

  -- My own card spending.
  insert into card_uses (owner_id, card_id, person_id, amount, used_on, reason_or_place, category) values
    (v_owner, c1, null, 8450, d - 15, 'Groceries · Shwapno', 'Groceries'),
    (v_owner, c1, null, 2300, d - 2, 'Fuel', 'Transport'),
    (v_owner, c2, null, 1499, d - 11, 'Streaming subscription', 'Subscription');

  -- Research ledger (separate).
  insert into research_expenses (owner_id, spent_on, facility, member, description, tag, amount) values
    (v_owner, d - 40, 'BMRC', 'Demo Member A', 'Printing consent forms', 'Printing', 1850),
    (v_owner, d - 22, 'NICVD', 'Demo Member B', 'Sample transport', null, 3200),
    (v_owner, d - 5, 'United Hospital', 'Demo Member A', 'Data entry assistant', 'Staff', 6000);
  insert into research_contributions (owner_id, paid_on, member, note, amount) values
    (v_owner, d - 45, 'Demo Member A', 'Bank Transfer', 6000), (v_owner, d - 30, 'Demo Member B', 'Cash', 5000);
end $$;
