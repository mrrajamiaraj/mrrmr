// Overview dashboard figures: separation of assets / receivables / liabilities / projections, reconciliation with
// the database view, no double counting, and month-to-date comparisons. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDashboard } from "../lib/dashboard.ts";

const TODAY = "2026-11-19";
const account = { id: "a1", name: "City Bank", holder_name: null, balance: 57300, debit_used: 97064, updated_at: "2026-11-19T00:00:00Z" };
const card = (o) => ({ id: "c1", slot: 1, bank: "City Bank", name: "Visa", network: null, last4: null, credit_limit: 100000, balance: 0, pay_by: null, updated_at: "", ...o });
const person = (id, name) => ({ id, name, relation: null, phone: null, notes: null });
const loan = (o) => ({ id: "l1", person_id: "p1", account_id: "a1", amount: 1000, taken_on: "2026-11-01", reason: "x", method: "Bank transfer", due_on: null, created_at: "2026-11-01T00:00:00Z", ...o });
const use = (o) => ({ id: "u1", card_id: "c1", person_id: "p1", amount: 1000, used_on: "2026-11-02", reason_or_place: "Shop", category: "Other", due_on: null, pay_plan: "full", emi_months: null, created_at: "2026-11-02T00:00:00Z", ...o });
const rep = (o) => ({ id: "r1", person_id: "p1", amount: 100, paid_on: "2026-11-05", via: "Cash", applies_to: "loan", card_id: null, account_id: null, created_at: "2026-11-05T00:00:00Z", ...o });
/** The view's per-person still_owes, computed the way the database does (netted across sources). */
const viewOf = (d) => d.people.map((p) => {
  const t = d.loans.filter((l) => l.person_id === p.id).reduce((s, l) => s + l.amount, 0) + d.cardUses.filter((u) => u.person_id === p.id).reduce((s, u) => s + u.amount, 0);
  const r = d.repayments.filter((x) => x.person_id === p.id).reduce((s, x) => s + x.amount, 0);
  return { person_id: p.id, still_owes: Math.max(t - r, 0), status: "Pending", next_due: null };
});
const data = (o) => { const d = { accounts: [account], cards: [card({})], people: [person("p1", "Rahim"), person("p2", "Karim")], loans: [], cardUses: [], repayments: [], ...o }; return { ...d, summary: viewOf(d) }; };

test("assets, receivables, liabilities and projection are separate figures", () => {
  const d = data({
    cards: [card({ balance: 93300 })],
    loans: [loan({ amount: 3500, due_on: "2026-11-18" })],
    cardUses: [use({ amount: 93000, due_on: "2026-12-30" }), use({ id: "own", person_id: null, amount: 300 })],
    repayments: [rep({ amount: 3300 })],
  });
  const x = computeDashboard(d, TODAY);
  assert.equal(x.bank.balance, 57300, "cash is the stored balance, untouched");
  assert.equal(x.receivables.bankLoans, 200);
  assert.equal(x.receivables.cards, 93000);
  assert.equal(x.receivables.total, 93200);
  assert.equal(x.projection.bankAfterLoans, 57500, "projection adds bank-loan receivables only — never card receivables");
  assert.equal(x.liabilities.cards, 93300);
  assert.equal(x.cards[0].othersOwe, 93000);
  assert.equal(x.cards[0].myShare, 300, "card balance − what others owe");
  assert.equal(x.cards[0].available, 6700);
});

test("open items add up exactly to receivables and reconcile with the database view", () => {
  const d = data({
    loans: [loan({ id: "A", amount: 5000, due_on: "2026-11-10" }), loan({ id: "B", amount: 5000, due_on: "2026-12-10" }), loan({ id: "C", person_id: "p2", amount: 0.1 }), loan({ id: "D", person_id: "p2", amount: 0.2 })],
    cardUses: [use({ amount: 600, pay_plan: "emi", emi_months: 3, due_on: "2026-11-15" }), use({ id: "u2", amount: 250 })],
    repayments: [rep({ amount: 5000 }), rep({ id: "r2", applies_to: "card", card_id: "c1", amount: 200 })],
  });
  const x = computeDashboard(d, TODAY);
  const itemsTotal = Math.round(x.open.reduce((s, o) => s + o.left * 100, 0)) / 100;
  assert.equal(itemsTotal, x.receivables.total);
  assert.equal(x.receivables.total, 5000 + 0.3 + 400 + 250);
  assert.equal(x.receivables.viewTotal, x.receivables.total);
  assert.equal(x.receivables.reconciled, true);
  assert.ok(x.open.some((o) => o.key.startsWith("u:") && o.left === 250 && o.status === "undated"), "undated card use is its own item");
  assert.ok(!x.open.some((o) => o.key === "l:A"), "loan A was repaid first (earliest due)");
});

test("overpaid on one source while owing on another: flagged, not hidden", () => {
  const d = data({ loans: [loan({ amount: 1000 })], cardUses: [use({ amount: 500 })], repayments: [rep({ amount: 1200 })] });
  const x = computeDashboard(d, TODAY);
  assert.equal(x.receivables.total, 500, "per source: loan 0 (overpaid), card 500");
  assert.equal(x.receivables.viewTotal, 300, "per person, netted");
  assert.equal(x.receivables.reconciled, false);
  assert.ok(x.insights.some((i) => i.id === "recon"));
});

test("due buckets: overdue, next 7 days, later, undated", () => {
  const d = data({
    loans: [loan({ id: "a", due_on: "2026-11-01" }), loan({ id: "b", person_id: "p2", due_on: "2026-11-24" }), loan({ id: "c", person_id: "p2", due_on: "2026-12-30", taken_on: "2026-11-02" })],
  });
  const x = computeDashboard(d, TODAY);
  assert.deepEqual([x.overdue.count, x.dueWeek.count], [1, 1]);
  assert.equal(x.open.find((o) => o.key === "l:c").status, "later");
  assert.ok(x.insights.some((i) => i.id === "overdue") && x.insights.some((i) => i.id === "week"));
});

test("activity lists every ledger row exactly once, newest first", () => {
  const d = data({
    loans: [loan({})], cardUses: [use({ used_on: "2026-11-10" }), use({ id: "own", person_id: null, used_on: "2026-11-11" })],
    repayments: [rep({ paid_on: "2026-11-12" })],
  });
  const x = computeDashboard(d, TODAY);
  assert.equal(x.activity.length, 4);
  assert.equal(new Set(x.activity.map((a) => a.id)).size, 4);
  assert.deepEqual(x.activity.map((a) => a.kind), ["repayment", "card_own", "card_other", "loan"]);
  assert.equal(x.activity[1].status, "Your spending");
});

test("month to date compares the same number of days, never a partial month to a full one", () => {
  const d = data({
    loans: [loan({ id: "n", taken_on: "2026-11-03", amount: 400 }), loan({ id: "o1", taken_on: "2026-10-10", amount: 900 }), loan({ id: "o2", taken_on: "2026-10-25", amount: 7000 })],
    repayments: [rep({ paid_on: "2026-11-04", amount: 100 }), rep({ id: "r2", paid_on: "2026-10-19", amount: 50 }), rep({ id: "r3", paid_on: "2026-10-20", amount: 999 })],
  });
  const m = computeDashboard(d, TODAY).monthToDate;
  assert.equal(m.days, 19);
  assert.equal(m.current.lent, 400);
  assert.equal(m.previous.lent, 900, "Oct 25 is after Oct 19, so it is excluded");
  assert.equal(m.previous.recovered, 50, "Oct 20 is excluded");
  assert.equal(m.previousLabel, "Oct 2026 1–19");
});

test("card pay-by in the past and high utilisation produce insights; no bank account → no projection", () => {
  const d = data({ accounts: [], cards: [card({ balance: 95000, pay_by: "2026-10-13" })] });
  const x = computeDashboard(d, TODAY);
  assert.equal(x.bank, null);
  assert.equal(x.projection, null);
  assert.ok(x.insights.some((i) => i.id === "util-c1"));
  assert.ok(x.insights.some((i) => i.id === "payby-c1"));
  assert.equal(x.obligations[0].passed, true);
});

test("possible duplicate people: names one letter apart (4+ letters), case-insensitive", async () => {
  const { similarNames } = await import("../lib/dashboard.ts");
  assert.deepEqual(similarNames(["Mamun Vai", "Mamun Vau", "Mom", "Mon", "Home", "homes", "Raja", "Rajib", "Shafin"]),
    [["Mamun Vai", "Mamun Vau"], ["Home", "homes"]]);
  const d = data({ people: [person("p1", "Mamun Vai"), person("p2", "Mamun Vau")] });
  assert.ok(computeDashboard(d, TODAY).insights.some((i) => i.id === "dupes"));
});

test("collections insight never quotes a percentage on a tiny base", () => {
  const d = data({ repayments: [rep({ paid_on: "2026-10-05", amount: 350 }), rep({ id: "r2", paid_on: "2026-11-05", amount: 58916 })], loans: [loan({ amount: 60000 })] });
  const i = computeDashboard(d, TODAY).insights.find((x) => x.id === "collect");
  assert.equal(i.title, "৳58,916 collected this month");
  const d2 = data({ repayments: [rep({ paid_on: "2026-10-05", amount: 1000 }), rep({ id: "r2", paid_on: "2026-11-05", amount: 1500 })], loans: [loan({ amount: 5000 })] });
  assert.equal(computeDashboard(d2, TODAY).insights.find((x) => x.id === "collect").title, "Collections up 50% vs last month");
});
