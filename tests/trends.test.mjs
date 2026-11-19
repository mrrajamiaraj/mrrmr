// Chart series agree with the monthly report (each entry counted once) and the time machine. Synthetic data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlySeries } from "../lib/trends.ts";
import { reportRows } from "../lib/reports.ts";

const TODAY = "2026-11-19";
const card = { id: "c1", slot: 1, bank: "City Bank", name: "D", network: null, last4: null, credit_limit: null, balance: 0, pay_by: null, updated_at: "" };
const loan = (o) => ({ id: "l", person_id: "p1", account_id: null, amount: 1000, taken_on: "2026-09-10", reason: "x", method: "Bank transfer", due_on: null, created_at: "", ...o });
const use = (o) => ({ id: "u", card_id: "c1", person_id: "p1", amount: 500, used_on: "2026-10-03", reason_or_place: "x", category: "Other", due_on: null, created_at: "", ...o });
const rep = (o) => ({ id: "r", person_id: "p1", amount: 300, paid_on: "2026-10-20", via: "Cash", applies_to: "loan", card_id: null, account_id: null, created_at: "", ...o });
const data = { accounts: [], cards: [card], people: [{ id: "p1", name: "A" }], summary: [],
  loans: [loan({}), loan({ id: "l2", taken_on: "2026-11-25", amount: 9999 })],
  cardUses: [use({}), use({ id: "own", person_id: null, amount: 77 })],
  repayments: [rep({}), rep({ id: "r2", applies_to: "card", card_id: "c1", amount: 100, paid_on: "2026-11-02" })] };

test("12 months, oldest first, ending this month", () => {
  const s = monthlySeries(data, TODAY);
  assert.equal(s.length, 12);
  assert.equal(s[0].key, "2025-12");
  assert.equal(s[11].key, "2026-11");
  assert.equal(s[11].label, "Nov 2026");
});

test("matches the monthly report: lent, repaid and owed at month end; future-dated entries ignored", () => {
  const s = monthlySeries(data, TODAY);
  const r = new Map(reportRows(data, { expenses: [], contributions: [] }, "month", TODAY).map((x) => [x.key, x]));
  // Past months must match exactly. (The report's current month also counts entries dated later this month; the chart
  // stops at today, so a future-dated entry never shows as money that already moved.)
  for (const p of s.filter((x) => r.has(x.key) && x.key < TODAY.slice(0, 7))) {
    const row = r.get(p.key);
    assert.equal(p.lent, row.lentLoans + row.lentCard, p.key);
    assert.equal(p.repaid, row.collectedLoans + row.collectedCard, p.key);
    assert.equal(p.owedEnd, row.receivablesEnd, p.key);
  }
  assert.deepEqual(s.slice(-3).map((p) => p.owedEnd), [1000, 1200, 1100]);
  assert.equal(s[11].lent, 0, "the Nov 25 loan is after today");
});
