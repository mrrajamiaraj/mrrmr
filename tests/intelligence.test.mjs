// Phase 6 logic against known scenarios: time machine, forecast, anomalies, reports. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { receivablesAsOf, researchAsOf, timeMachine } from "../lib/history.ts";
import { forecast } from "../lib/forecast.ts";
import { findAnomalies } from "../lib/anomalies.ts";
import { reportRows } from "../lib/reports.ts";
import { computeDashboard } from "../lib/dashboard.ts";

const TODAY = "2026-11-19";
const account = { id: "a1", name: "City Bank", holder_name: null, balance: 50000, debit_used: 0, updated_at: "2026-11-19T00:00:00Z" };
const card = { id: "c1", slot: 1, bank: "City Bank", name: "Visa", network: null, last4: null, credit_limit: 100000, balance: 20000, pay_by: "2026-12-05", updated_at: "" };
const people = [{ id: "p1", name: "Rahim" }, { id: "p2", name: "Karim" }].map((p) => ({ ...p, relation: null, phone: null, notes: null }));
const loan = (o) => ({ id: "l1", person_id: "p1", account_id: "a1", amount: 10000, taken_on: "2026-09-01", reason: "x", method: "Bank transfer", due_on: "2026-12-01", created_at: "1", ...o });
const use = (o) => ({ id: "u1", card_id: "c1", person_id: "p2", amount: 6000, used_on: "2026-10-01", reason_or_place: "Shop", category: "Other", due_on: "2026-11-25", pay_plan: "full", emi_months: null, created_at: "2", ...o });
const rep = (o) => ({ id: "r1", person_id: "p1", amount: 4000, paid_on: "2026-10-15", via: "Bank transfer", applies_to: "loan", card_id: null, account_id: "a1", created_at: "3", ...o });
const base = (o = {}) => {
  const d = { accounts: [account], cards: [card], people, loans: [loan({})], cardUses: [use({})], repayments: [rep({})], ...o };
  return { ...d, summary: d.people.map((p) => ({ person_id: p.id, still_owes: Math.max(d.loans.filter((l) => l.person_id === p.id).reduce((s, l) => s + l.amount, 0) + d.cardUses.filter((u) => u.person_id === p.id).reduce((s, u) => s + u.amount + (u.emi_charges ?? 0), 0) - d.repayments.filter((r) => r.person_id === p.id).reduce((s, r) => s + r.amount, 0), 0), status: "Pending", next_due: null })) };
};
const research = { expenses: [{ id: "e1", spent_on: "2026-10-02", facility: "BHS", member: "Raja", description: "", tag: null, amount: 500, created_at: "" }],
  contributions: [{ id: "k1", paid_on: "2026-11-01", member: "Raja", note: null, amount: 300, created_at: "" }], missingTables: false };

test("time machine: receivables and research rebuilt for past dates from dated events", () => {
  const d = base();
  assert.deepEqual(receivablesAsOf(d, "2026-08-31"), { bankLoans: 0, byCard: { c1: 0 }, cards: 0, total: 0, people: 0 }, "before anything happened");
  assert.equal(receivablesAsOf(d, "2026-09-30").total, 10000, "loan given, nothing repaid");
  assert.equal(receivablesAsOf(d, "2026-10-01").total, 16000, "card use added same day");
  assert.equal(receivablesAsOf(d, "2026-10-15").total, 12000, "repayment counted on its date");
  assert.deepEqual(researchAsOf(research, "2026-10-31"), { spent: 500, contributed: 0, net: -500 });
  const tm = timeMachine(d, research, "2026-09-30", TODAY);
  assert.equal(tm.then.receivables.total, 10000);
  assert.equal(tm.now.receivables.total, 12000);
  assert.deepEqual(tm.since, { lent: 0, cardUse: 6000, repaid: 4000, researchSpent: 500, researchContributed: 300 });
  assert.equal(tm.then.receivables.total + tm.since.lent + tm.since.cardUse - tm.since.repaid, tm.now.receivables.total, "then + changes = now");
  assert.equal(tm.firstRecord, "2026-09-01");
});

test("forecast: confirmed obligations vs uncertain collections; three scenarios", () => {
  const d = computeDashboard(base(), TODAY);
  const f30 = forecast(d, 30, new Set());
  assert.deepEqual(f30.obligations.map((o) => [o.iso, o.amount]), [["2026-12-05", 20000]], "card bill in range");
  assert.equal(f30.expectedLoans, 6000, "Rahim's loan due Dec 1");
  assert.equal(f30.expectedCards, 6000, "Karim's card use due Nov 25");
  const [none, onTime] = f30.scenarios;
  assert.deepEqual([none.cash, none.cardOwed], [50000, 20000], "no collections: nothing changes");
  assert.deepEqual([onTime.cash, onTime.cardOwed], [56000, 14000], "loan → bank; card collection → card, never cash");
  const delayed = forecast(d, 30, new Set(["p1"])).scenarios[2];
  assert.deepEqual([delayed.cash, delayed.cardOwed], [50000, 14000], "Rahim delayed: his loan doesn't arrive");
  const f5 = forecast(d, 5, new Set());
  assert.equal(f5.expected.length, 0);
  assert.equal(f5.obligations.length, 0);
});

test("anomalies: each rule fires on its scenario and nowhere else", () => {
  const clean = base();
  assert.deepEqual(findAnomalies(clean, computeDashboard(clean, TODAY), TODAY).map((a) => a.kind), []);
  const messy = base({
    loans: [loan({}), loan({ id: "l2", due_on: "2026-08-01" })],
    cardUses: [use({}), use({ id: "u2", pay_plan: "emi", emi_months: 3, due_on: "2026-09-01" }), use({ id: "u3", pay_plan: "emi", emi_months: 3, due_on: "2026-09-01" })],
    repayments: [rep({ amount: 30000 }), rep({ id: "r9", person_id: "p2", paid_on: "2026-12-30", amount: 1, applies_to: "card", card_id: "c1", account_id: null })],
    people: [...people, { id: "p3", name: "Rahima", relation: null, phone: null, notes: null }],
  });
  const kinds = findAnomalies(messy, computeDashboard(messy, TODAY), TODAY).map((a) => a.kind);
  for (const k of ["Duplicate-looking", "Overpayment", "Overlapping EMI", "Date order", "Possible duplicate person"]) assert.ok(kinds.includes(k), `missing ${k}: ${kinds}`);
});

test("reports: every event in exactly one period/column; receivables at period end", () => {
  const d = base({ cardUses: [use({}), use({ id: "own", person_id: null, amount: 700, used_on: "2026-11-02" })] });
  const rows = reportRows(d, research, "month", TODAY);
  assert.deepEqual(rows.map((r) => r.key), ["2026-11", "2026-10", "2026-09"]);
  const total = (k) => rows.reduce((s, r) => s + r[k], 0);
  assert.equal(total("lentLoans"), 10000);
  assert.equal(total("lentCard"), 6000);
  assert.equal(total("ownCard"), 700, "your own spending is its own column, never 'lent'");
  assert.equal(total("collectedLoans") + total("collectedCard"), 4000);
  assert.equal(total("creditedToBank"), 4000);
  assert.deepEqual(rows.map((r) => r.receivablesEnd), [12000, 12000, 10000]);
  assert.equal(reportRows(d, research, "year", TODAY)[0].lentLoans, 10000);
});
