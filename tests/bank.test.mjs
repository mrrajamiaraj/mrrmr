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
