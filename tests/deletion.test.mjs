// Deletion impact preview: which balances each entry is linked to (one question per account/card and kind), exact
// before/after outstanding amounts, EMI plans removed, split-purchase shares kept, overpayment warning. Synthetic data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deletionImpact, personItems } from "../lib/deletion.ts";

const TODAY = "2026-11-19";
const person = (id, name) => ({ id, name, relation: null, phone: null, notes: null });
const account = { id: "a1", name: "City Bank", holder_name: null, balance: 50000, debit_used: 0, updated_at: "" };
const card = { id: "c1", slot: 1, bank: "City Bank", name: "Demo", network: null, last4: null, credit_limit: 100000, balance: 20000, pay_by: null, updated_at: "" };
const loan = (o) => ({ id: "l1", person_id: "p1", account_id: "a1", amount: 5000, taken_on: "2026-01-01", reason: "Rent", method: "Bank transfer", due_on: null, created_at: "2026-01-01T00:00:00Z", ...o });
const use = (o) => ({ id: "u1", card_id: "c1", person_id: "p1", amount: 3000, used_on: "2026-01-02", reason_or_place: "Phone", category: "Other", due_on: "2026-02-01", pay_plan: "full", emi_months: null, created_at: "2026-01-02T00:00:00Z", ...o });
const rep = (o) => ({ id: "r1", person_id: "p1", amount: 1000, paid_on: "2026-01-05", via: "Bank transfer", applies_to: "loan", card_id: null, account_id: "a1", created_at: "2026-01-05T00:00:00Z", ...o });
const base = (o) => ({ accounts: [account], cards: [card], people: [person("p1", "Ayesha"), person("p2", "Karim")], loans: [], cardUses: [], repayments: [], summary: [], ...o });

test("one loan: one bank question; outstanding before → after is exact", () => {
  const d = base({ loans: [loan({}), loan({ id: "l2", amount: 2000 })], repayments: [rep({})] });
  const x = deletionImpact(d, TODAY, [{ kind: "loan", id: "l2" }]);
  assert.equal(x.entries.length, 1);
  assert.equal(x.groups.length, 1);
  assert.equal(x.groups[0].target, "account");
  assert.match(x.groups[0].question, /taken out of City Bank/);
  assert.match(x.groups[0].reversal, /Put ৳2,000 back into City Bank/);
  assert.deepEqual([x.people[0].before, x.people[0].after], [6000, 4000]);
});

test("deleting a repayment raises what they owe; a cash repayment has no balance link", () => {
  const d = base({ loans: [loan({})], repayments: [rep({ account_id: null, via: "Cash" })] });
  const x = deletionImpact(d, TODAY, [{ kind: "repayment", id: "r1" }]);
  assert.equal(x.groups.length, 0, "a repayment that never went into the bank has nothing to reverse");
  assert.deepEqual([x.people[0].before, x.people[0].after], [4000, 5000]);
  assert.equal(x.repaymentTotal, 1000);
});

test("card purchase: card question, EMI plan counted, other split shares kept", () => {
  const d = base({ cardUses: [
    use({ pay_plan: "emi", emi_months: 6, purchase_group: "g1" }),
    use({ id: "u2", person_id: "p2", amount: 2000, purchase_group: "g1" }),
    use({ id: "u3", person_id: null, amount: 500, purchase_group: "g1" }),
  ] });
  const x = deletionImpact(d, TODAY, [{ kind: "card_use", id: "u1" }]);
  assert.equal(x.groups[0].target, "card");
  assert.match(x.groups[0].reversal, /never below ৳0/);
  assert.equal(x.emiPlans, 1);
  assert.equal(x.sharedKept, 2, "Karim's share and my own share stay");
  assert.equal(x.people.length, 1, "only Ayesha is affected");
});

test("deleting a purchase that was partly repaid warns that the repayment becomes an overpayment", () => {
  const d = base({ cardUses: [use({})], repayments: [rep({ applies_to: "card", card_id: "c1", account_id: null, amount: 1200 })] });
  const x = deletionImpact(d, TODAY, [{ kind: "card_use", id: "u1" }]);
  assert.equal(x.excess, 1200);
  assert.equal(x.people[0].after, 0);
});

test("whole history: every entry, grouped questions per place and kind; other people untouched", () => {
  const d = base({
    loans: [loan({}), loan({ id: "l2", amount: 1000 }), loan({ id: "lk", person_id: "p2" })],
    cardUses: [use({})],
    repayments: [rep({}), rep({ id: "r2", applies_to: "card", card_id: "c1", account_id: null, amount: 500 })],
  });
  const items = personItems(d, "p1");
  assert.equal(items.length, 5);
  const x = deletionImpact(d, TODAY, items);
  assert.deepEqual(x.groups.map((g) => g.key).sort(), ["account:a1:loan", "account:a1:repayment", "card:c1:card_use", "card:c1:repayment"]);
  assert.equal(x.groups.find((g) => g.key === "account:a1:loan").total, 6000);
  assert.deepEqual([x.people[0].before, x.people[0].after], [7500, 0]);
  assert.ok(!x.entries.some((e) => e.id === "lk"));
});

test("unknown ids are reported as missing (already deleted), never guessed", () => {
  const x = deletionImpact(base({}), TODAY, [{ kind: "loan", id: "gone" }]);
  assert.equal(x.entries.length, 0);
  assert.deepEqual(x.missing, [{ kind: "loan", id: "gone" }]);
});
