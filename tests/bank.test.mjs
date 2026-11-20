// Recorded bank movements: only what the ledger can prove. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bankMovements } from "../lib/bank.ts";

const d = {
  accounts: [{ id: "a1" }], cards: [], summary: [],
  people: [{ id: "p1", name: "Rahim" }],
  loans: [
    { id: "l1", person_id: "p1", account_id: "a1", amount: 5000, taken_on: "2026-10-03", reason: "Rent", method: "Bank transfer", created_at: "1" },
    { id: "l2", person_id: "p1", account_id: null, amount: 999, taken_on: "2026-10-04", reason: "x", method: "Cash withdrawal", created_at: "2" },
  ],
  cardUses: [],
  repayments: [
    { id: "r1", person_id: "p1", amount: 2000, paid_on: "2026-11-02", via: "bKash", applies_to: "loan", card_id: null, account_id: "a1", created_at: "3" },
    { id: "r2", person_id: "p1", amount: 0.1, paid_on: "2026-11-05", via: "Cash", applies_to: "loan", card_id: null, account_id: "a1", created_at: "4" },
    { id: "r3", person_id: "p1", amount: 0.2, paid_on: "2026-11-06", via: "Cash", applies_to: "loan", card_id: null, account_id: "a1", created_at: "5" },
    { id: "r4", person_id: "p1", amount: 700, paid_on: "2026-11-07", via: "Cash", applies_to: "loan", card_id: null, account_id: null, created_at: "6" },
  ],
};

test("only repayments credited to this account count as inflows; loans from it are 'unknown effect'", () => {
  const { rows } = bankMovements(d, "a1");
  assert.deepEqual(rows.map((r) => [r.id, r.kind, r.effect]), [["r3", "credit", "credited"], ["r2", "credit", "credited"], ["r1", "credit", "credited"], ["l1", "loan", "unknown"]]);
  assert.ok(!rows.some((r) => r.id === "r4"), "a repayment not added to the account is not a bank movement");
  assert.ok(!rows.some((r) => r.id === "l2"), "a loan not linked to this account is not shown");
});

test("monthly totals are exact and kept separate (never netted)", () => {
  const { months } = bankMovements(d, "a1");
  assert.deepEqual(months, [{ ym: "2026-11", credited: 2000.3, loansMade: 0 }, { ym: "2026-10", credited: 0, loansMade: 5000 }]);
});

test("bankBorrowers: who took money from this account, with each loan; other-source loans left out", async () => {
  const { bankBorrowers } = await import("../lib/bank.ts");
  const d2 = { ...d, people: [{ id: "p1", name: "Rahim" }, { id: "p2", name: "Karim" }],
    loans: [...d.loans, { id: "l3", person_id: "p1", account_id: "a1", amount: 0.1, taken_on: "2026-11-01", reason: "Bus", method: "Cash withdrawal", created_at: "3" },
      { id: "l4", person_id: "p2", account_id: "a1", amount: 9000, taken_on: "2026-09-01", reason: "Fees", method: "Bank transfer", due_on: "2026-12-01", created_at: "4" }] };
  const b = bankBorrowers(d2, "a1");
  assert.deepEqual(b.map((x) => [x.name, x.taken, x.loans.length]), [["Karim", 9000, 1], ["Rahim", 5000.1, 2]]);
  assert.deepEqual(b[1].loans.map((l) => l.id), ["l3", "l1"], "newest loan first");
  assert.equal(b[1].first, "2026-10-03");
  assert.equal(b[1].creditedBack, 2000.3, "only repayments credited to this account: 2000 + 0.1 + 0.2");
  assert.equal(b[0].loans[0].due, "2026-12-01");
  assert.ok(!b.some((x) => x.loans.some((l) => l.id === "l2")), "a loan not from this account is not listed");
});

test("bankOutlook: overdue first, then each due date, then undated; running balance exact; cards and others left out", async () => {
  const { bankOutlook } = await import("../lib/bank.ts");
  const T = "2026-11-21";
  const open = [
    { source: "loan", personId: "p1", name: "Rahim", iso: "2026-12-05", left: 0.2 },
    { source: "loan", personId: "p2", name: "Karim", iso: "2026-11-01", left: 100 },
    { source: "loan", personId: "p1", name: "Rahim", iso: "2026-10-01", left: 0.1 },
    { source: "loan", personId: "p2", name: "Karim", iso: null, left: 50 },
    { source: "loan", personId: "p2", name: "Karim", iso: "2026-12-05", left: 0.1 },
    { source: "card", personId: "p1", name: "Rahim", iso: "2026-12-01", left: 999 },
    { source: "loan", personId: "p9", name: "Not from this account", iso: "2026-12-01", left: 777 },
  ];
  const o = bankOutlook(1000, open, ["p1", "p2"], T);
  assert.deepEqual(o.steps.map((s) => [s.kind, s.iso, s.amount, s.balance]), [
    ["overdue", null, 100.1, 1100.1], ["dated", "2026-12-05", 0.3, 1100.4], ["undated", null, 50, 1150.4],
  ]);
  assert.deepEqual(o.steps[1].people.map((p) => [p.name, p.amount]), [["Rahim", 0.2], ["Karim", 0.1]]);
  assert.deepEqual([o.now, o.expected, o.after], [1000, 150.4, 1150.4]);
  assert.deepEqual(bankOutlook(5, [], [], T), { now: 5, expected: 0, after: 5, steps: [] });
});

test("loanLedger: loans and loan repayments in date order with a running total; card repayments left out", async () => {
  const { loanLedger } = await import("../lib/bank.ts");
  const lines = loanLedger({ ...d, repayments: [...d.repayments, { id: "rc", person_id: "p1", amount: 5, paid_on: "2026-11-03", via: "Cash", applies_to: "card", card_id: "c", account_id: null, created_at: "9" }] }, "p1", "a1");
  assert.deepEqual(lines.map((l) => [l.id, l.kind, l.viaAccount, l.owes]), [
    ["l1", "loan", true, 5000], ["l2", "loan", false, 5999], ["r1", "repayment", true, 3999], ["r2", "repayment", true, 3998.9], ["r3", "repayment", true, 3998.7], ["r4", "repayment", false, 3298.7],
  ]);
});
