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
