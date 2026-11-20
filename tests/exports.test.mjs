// Report builders: statements reconcile, filters apply, formulas are defused. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardTransactions, debtorStatement, emiSchedules } from "../lib/exports.ts";
import { csvCell } from "../lib/security.ts";

const data = {
  accounts: [], summary: [],
  cards: [{ id: "c1", slot: 1, bank: "City Bank", name: "Visa", credit_limit: null, balance: 0, pay_by: null, updated_at: "" }],
  people: [{ id: "p1", name: "=HYPERLINK(evil)", relation: null, phone: null, notes: null }],
  loans: [{ id: "l1", person_id: "p1", account_id: null, amount: 1000, taken_on: "2026-10-01", reason: "x", method: "Cash withdrawal", due_on: null, created_at: "1" }],
  cardUses: [{ id: "u1", card_id: "c1", person_id: "p1", amount: 600, used_on: "2026-10-05", reason_or_place: "Shop", category: "Other", due_on: "2026-11-01", pay_plan: "emi", emi_months: 3, emi_charges: 30, created_at: "2" }],
  repayments: [{ id: "r1", person_id: "p1", amount: 210, paid_on: "2026-11-02", via: "Cash", applies_to: "card", card_id: "c1", account_id: null, created_at: "3" }],
};

test("debtor statement: running balance ends at what they owe, totals per source reconcile", () => {
  const t = debtorStatement(data, "p1", "2026-11-19");
  const events = t.rows.filter((r) => r.length && r[1] !== "Totals");
  assert.equal(events.at(-1)[5], 1000 + 630 - 210);
  const all = t.rows.find((r) => r[2] === "All sources");
  assert.deepEqual(all.slice(3), [1630, 210, 1420]);
  assert.equal(t.rows.find((r) => r[2] === "City Bank American Express Gold Credit Card")[5], 420);
  assert.equal(debtorStatement(data, "nobody", "2026-11-19"), null);
});

test("card export filters by date and includes repayments", () => {
  assert.equal(cardTransactions(data, 1).rows.length, 2);
  assert.equal(cardTransactions(data, 1, "2026-11-01").rows.length, 1);
  assert.equal(cardTransactions(data, 2), null);
});

test("EMI export lists every installment with charges included", () => {
  const t = emiSchedules(data);
  assert.deepEqual(t.rows.map((r) => [r[6], r[8], r[9], r[10]]), [["1/3", 210, 0, "paid"], ["2/3", 210, 210, "unpaid"], ["3/3", 210, 210, "unpaid"]]);
});

test("a name that looks like a formula is defused in the CSV", () => {
  assert.equal(csvCell(data.people[0].name), "'=HYPERLINK(evil)");
});
