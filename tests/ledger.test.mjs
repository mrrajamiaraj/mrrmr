// Ledger regression tests: EMI schedules, repayment allocation, and per-person totals. Run with `npm test`.
// The `legacy*` functions are verbatim copies of the pre-money.ts implementation. They pin the business rules:
// the exact-arithmetic version must give the same results wherever the old float code was not itself off by a paisa.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installmentsOf, settle, emiPerMonth, buildProfiles, buildCardProfiles, buildLoanProfiles, cardPlanStatus, settleLoans, nextLoanDue } from "../lib/ledger.ts";
import { addMonths } from "../lib/format.ts";

// ---- legacy oracle (copied from lib/ledger.ts before the change) -------------------------------------------
const round2 = (n) => Math.round(n * 100) / 100;
function legacyInstallments(u) {
  if (!u.due_on) return [];
  if (!(u.pay_plan === "emi" && (u.emi_months ?? 0) > 1)) return [{ useId: u.id, iso: u.due_on, amount: u.amount, n: 1, of: 1 }];
  const of = u.emi_months;
  const per = Math.floor((u.amount / of) * 100) / 100;
  return Array.from({ length: of }, (_, i) => ({
    useId: u.id, iso: addMonths(u.due_on, i), n: i + 1, of,
    amount: i === of - 1 ? Math.round((u.amount - per * (of - 1)) * 100) / 100 : per,
  }));
}
function legacySettle(sched, pays) {
  const out = [...sched].sort((a, b) => a.iso.localeCompare(b.iso) || a.n - b.n).map((s) => ({ ...s, left: s.amount, paidOn: null }));
  let i = 0;
  for (const p of [...pays].sort((a, b) => a.iso.localeCompare(b.iso))) {
    let pot = p.amount;
    while (pot > 0.005 && i < out.length) {
      const take = Math.min(pot, out[i].left);
      out[i].left = round2(out[i].left - take);
      out[i].paidOn = p.iso || null;
      pot = round2(pot - take);
      if (out[i].left <= 0.005) { out[i].left = 0; i++; }
    }
  }
  return out;
}

// ---- fixtures ---------------------------------------------------------------------------------------------
const use = (o) => ({ id: "u1", card_id: "c1", person_id: "p1", amount: 1000, used_on: "2026-01-10", reason_or_place: "Phone",
  category: "Electronics", due_on: "2026-02-10", pay_plan: "full", emi_months: null, created_at: "2026-01-10T00:00:00Z", ...o });
const rep = (o) => ({ id: "r1", person_id: "p1", amount: 100, paid_on: "2026-02-01", via: "Cash", applies_to: "card", card_id: "c1",
  account_id: null, created_at: "2026-02-01T00:00:00Z", ...o });
const data = (o = {}) => ({
  accounts: [], cards: [{ id: "c1", slot: 1, bank: "City Bank", name: "Visa", network: null, last4: null, credit_limit: null, balance: 0, pay_by: null, updated_at: "" }],
  people: [{ id: "p1", name: "Rahim Uddin", relation: null, phone: null, notes: null }],
  loans: [], cardUses: [], repayments: [], summary: [], ...o,
});

// Deterministic PRNG so failures reproduce.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

test("EMI installments: floor per month, last absorbs remainder (৳1,000 × 3)", () => {
  const s = installmentsOf(use({ pay_plan: "emi", emi_months: 3 }));
  assert.deepEqual(s.map((x) => x.amount), [333.33, 333.33, 333.34]);
  assert.deepEqual(s.map((x) => x.iso), ["2026-02-10", "2026-03-10", "2026-04-10"]);
  assert.equal(emiPerMonth(1000, 3), 333.33);
});

test("EMI dates clamp to month end (Jan 31 → Feb 28)", () => {
  const s = installmentsOf(use({ pay_plan: "emi", emi_months: 3, due_on: "2026-01-31" }));
  assert.deepEqual(s.map((x) => x.iso), ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

test("full-payment use is one installment; no due date means no schedule", () => {
  assert.equal(installmentsOf(use({})).length, 1);
  assert.deepEqual(installmentsOf(use({ due_on: null })), []);
});

test("installments match the legacy rule on 2,000 random EMIs and always sum to the amount", () => {
  for (let i = 0; i < 2000; i++) {
    const amount = Math.round(rand() * 5_000_000) / 100 + 0.01;
    const months = [3, 6, 9, 12, 18, 24, 36][Math.floor(rand() * 7)];
    const u = use({ amount, pay_plan: "emi", emi_months: months });
    const now = installmentsOf(u), old = legacyInstallments(u);
    const sumP = now.reduce((t, x) => t + Math.round(x.amount * 100), 0);
    assert.equal(sumP, Math.round(amount * 100), `sum for ${amount} / ${months}`);
    // The old code floored the double amount/months*100, which can land just under an integer and lose a paisa
    // (৳1.14 / 3 gave 0.37 instead of 0.38; ~1.3% of amount/month pairs). The rule — round down to the paisa — is unchanged; only that float error is gone.
    const exactPer = Math.floor(Math.round(amount * 100) / months);
    for (let k = 0; k < months - 1; k++) {
      assert.equal(Math.round(now[k].amount * 100), exactPer, `${amount}/${months} #${k}`);
      assert.ok(Math.round(old[k].amount * 100) - exactPer <= 0 && Math.round(old[k].amount * 100) - exactPer >= -1, "legacy is exact or 1 paisa low");
    }
  }
});

test("settle: oldest payment clears earliest installment first, partial payments carry over", () => {
  const sched = installmentsOf(use({ amount: 600, pay_plan: "emi", emi_months: 3 })); // 200 × 3
  const out = settle(sched, [{ iso: "2026-02-05", amount: 250 }, { iso: "2026-03-01", amount: 100 }]);
  assert.deepEqual(out.map((s) => s.left), [0, 50, 200]);
  assert.deepEqual(out.map((s) => s.paidOn), ["2026-02-05", "2026-03-01", null]);
});

test("settle: overpayment beyond the schedule is ignored, never negative", () => {
  const out = settle(installmentsOf(use({ amount: 100 })), [{ iso: "2026-02-01", amount: 500 }]);
  assert.deepEqual(out.map((s) => s.left), [0]);
});

test("settle: exact where floats drift (10 × ৳0.10 clears ৳1.00)", () => {
  const out = settle(installmentsOf(use({ amount: 1 })), Array.from({ length: 10 }, (_, i) => ({ iso: `2026-02-${String(i + 1).padStart(2, "0")}`, amount: 0.1 })));
  assert.equal(out[0].left, 0);
});

test("settle matches the legacy allocation on 2,000 random schedules", () => {
  for (let i = 0; i < 2000; i++) {
    const uses = Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, k) => {
      const emi = rand() < 0.6;
      return use({ id: `u${k}`, amount: Math.round(rand() * 10_000_000) / 100 + 1, pay_plan: emi ? "emi" : "full",
        emi_months: emi ? [3, 6, 12][Math.floor(rand() * 3)] : null, due_on: `2026-0${1 + Math.floor(rand() * 9)}-1${Math.floor(rand() * 9)}` });
    });
    const sched = uses.flatMap(installmentsOf);
    const pays = Array.from({ length: Math.floor(rand() * 6) }, (_, k) => ({ iso: `2026-0${1 + Math.floor(rand() * 9)}-0${1 + k}`, amount: Math.round(rand() * 3_000_000) / 100 + 0.01 }));
    // Same schedule into both, so this compares only the allocation algorithm (the schedule is pinned above).
    const now = settle(sched, pays), old = legacySettle(sched, pays);
    assert.equal(now.length, old.length);
    for (let k = 0; k < now.length; k++) {
      assert.equal(now[k].useId, old[k].useId);
      assert.equal(now[k].n, old[k].n);
      assert.equal(now[k].left, old[k].left, `case ${i} installment ${k}`);
      assert.equal(now[k].paidOn, old[k].paidOn, `case ${i} installment ${k} paidOn`);
    }
    assert.equal(now.reduce((t, s) => t + Math.round(s.left * 100), 0),
      Math.max(0, sched.reduce((t, s) => t + Math.round(s.amount * 100), 0) - pays.reduce((t, p) => t + Math.round(p.amount * 100), 0)),
      `case ${i}: what's left = schedule − payments (floored at 0)`);
  }
});

test("cardPlanStatus: EMI progress and next installment", () => {
  const d = data({
    cardUses: [use({ amount: 600, pay_plan: "emi", emi_months: 3 })],
    repayments: [rep({ amount: 200 })],
  });
  const s = cardPlanStatus(d, "c1").get("u1");
  assert.equal(s.plan, "emi");
  assert.equal(s.paidCount, 1);
  assert.equal(s.left, 400);
  assert.equal(s.next.iso, "2026-03-10");
});

test("buildProfiles: totals are exact, owes comes from the database view when present", () => {
  const d = data({
    loans: [{ id: "l1", person_id: "p1", account_id: null, amount: 0.1, taken_on: "2026-01-01", reason: "a", method: "Cash withdrawal", due_on: null, created_at: "2026-01-01T00:00:00Z" },
            { id: "l2", person_id: "p1", account_id: null, amount: 0.2, taken_on: "2026-01-02", reason: "b", method: "Cash withdrawal", due_on: null, created_at: "2026-01-02T00:00:00Z" }],
    repayments: [rep({ applies_to: "loan", card_id: null, amount: 0.3, paid_on: "2026-01-03" })],
  });
  const [p] = buildProfiles(d, "2026-02-01");
  assert.equal(p.loanTotal, 0.3, "0.1 + 0.2 is exactly 0.3");
  assert.equal(p.owes, 0);
  assert.equal(p.loanOut, 0);
  assert.equal(p.status, "Repaid");
  assert.deepEqual(p.events.map((e) => e.owesAfter), [0, 0.3, 0.1], "running balance, newest first");

  const withView = buildProfiles({ ...d, summary: [{ person_id: "p1", still_owes: 42, status: "Pending", next_due: null }] }, "2026-02-01")[0];
  assert.equal(withView.owes, 42, "the view is authoritative");
});

test("buildProfiles: card outstanding per card drops fully repaid cards", () => {
  const d = data({ cardUses: [use({ amount: 100.1 })], repayments: [rep({ amount: 100.1 })] });
  assert.deepEqual(buildProfiles(d, "2026-02-01")[0].cardOutByCard, {});
  const d2 = data({ cardUses: [use({ amount: 100.1 })], repayments: [rep({ amount: 0.1 })] });
  assert.deepEqual(buildProfiles(d2, "2026-02-01")[0].cardOutByCard, { c1: 100 });
});

test("scoped profiles keep bank loans and card use separate", () => {
  const d = data({
    loans: [{ id: "l1", person_id: "p1", account_id: null, amount: 5000, taken_on: "2026-01-01", reason: "rent", method: "Bank transfer", due_on: "2026-01-20", created_at: "2026-01-01T00:00:00Z" }],
    cardUses: [use({ amount: 1000 })],
    repayments: [rep({ applies_to: "loan", card_id: null, amount: 2000 })],
  });
  const [loan] = buildLoanProfiles(d, "2026-02-01");
  assert.equal(loan.used, 5000);
  assert.equal(loan.owes, 3000);
  assert.equal(loan.status, "Partially Paid");
  assert.equal(loan.dueKind, "late");
  const [card] = buildCardProfiles(d, "c1", "2026-02-01");
  assert.equal(card.used, 1000);
  assert.equal(card.owes, 1000, "a loan repayment never reduces card debt");
  assert.equal(card.status, "Pending");
});

// ---- loan allocation (owner decision 2026-11-19: repayments pay the earliest-due loan first) -----------------
const loan = (o) => ({ id: "l1", person_id: "p1", account_id: null, amount: 5000, taken_on: "2026-01-01", reason: "x",
  method: "Bank transfer", due_on: null, created_at: "2026-01-01T00:00:00Z", ...o });
const loanPay = (o) => rep({ applies_to: "loan", card_id: null, ...o });

test("loan repayment pays off the earliest-due loan first, so a covered loan is no longer late", () => {
  const loans = [loan({ id: "A", due_on: "2026-01-10" }), loan({ id: "B", due_on: "2026-03-10", taken_on: "2026-01-05" })];
  const pays = [loanPay({ amount: 5000, paid_on: "2026-01-08" })];
  assert.deepEqual(settleLoans(loans, pays).map((s) => [s.useId, s.left]), [["A", 0], ["B", 5000]]);
  assert.equal(nextLoanDue(loans, pays), "2026-03-10");

  const [p] = buildLoanProfiles(data({ loans, repayments: pays }), "2026-02-01");
  assert.equal(p.owes, 5000, "totals are unchanged");
  assert.equal(p.status, "Partially Paid");
  assert.equal(p.due, "2026-03-10");
  assert.equal(p.dueKind, "later", "was 'late — Jan 10' under the old pooled rule");
});

test("a partly paid earliest loan keeps its own (late) date", () => {
  const loans = [loan({ id: "A", due_on: "2026-01-10" }), loan({ id: "B", due_on: "2026-03-10" })];
  const [p] = buildLoanProfiles(data({ loans, repayments: [loanPay({ amount: 3000 })] }), "2026-02-01");
  assert.equal(p.due, "2026-01-10");
  assert.equal(p.dueKind, "late");
});

test("loans with no pay-back date are paid last; if only those remain there is no due date", () => {
  const loans = [loan({ id: "U", due_on: null, taken_on: "2025-12-01" }), loan({ id: "D", due_on: "2026-02-20" })];
  assert.equal(nextLoanDue(loans, []), "2026-02-20");
  assert.equal(nextLoanDue(loans, [loanPay({ amount: 5000 })]), null, "dated loan paid, undated one left");
  assert.deepEqual(settleLoans(loans, [loanPay({ amount: 5000 })]).map((s) => [s.useId, s.left]), [["D", 0], ["U", 5000]]);
});

test("same due date: the older loan is paid first", () => {
  const loans = [loan({ id: "new", due_on: "2026-02-01", taken_on: "2026-01-20" }), loan({ id: "old", due_on: "2026-02-01", taken_on: "2026-01-02" })];
  assert.deepEqual(settleLoans(loans, [loanPay({ amount: 5000 })]).map((s) => [s.useId, s.left]), [["old", 0], ["new", 5000]]);
});

test("Debtors page: due date is the earliest really-unpaid loan or card installment, and can be late", () => {
  const d = data({
    loans: [loan({ id: "A", due_on: "2026-01-10" }), loan({ id: "B", due_on: "2026-04-10" })],
    cardUses: [use({ amount: 600, pay_plan: "emi", emi_months: 3, due_on: "2026-01-15" })], // 200 on Jan 15, Feb 15, Mar 15
    repayments: [loanPay({ amount: 5000 }), rep({ amount: 200, paid_on: "2026-01-14" })],
    summary: [{ person_id: "p1", still_owes: 5400, status: "Partially Paid", next_due: "2026-02-15" }],
  });
  const [p] = buildProfiles(d, "2026-03-01");
  assert.equal(p.owes, 5400, "owes still comes from the database view");
  assert.equal(p.due, "2026-02-15", "loan A is paid; EMI #2 (Feb 15) is the earliest unpaid");
  assert.equal(p.dueKind, "late", "the view's future-only next_due could never show this");
  assert.equal(buildProfiles({ ...d, repayments: [] }, "2026-01-05")[0].due, "2026-01-10");
});

// ---- EMI charges (owner decision 2026-11-19: the buyer pays them). Previous vs new behaviour. -------------------
import { owedOf } from "../lib/ledger.ts";

test("BEFORE = AFTER when no charges are recorded (every existing row): amounts, schedule and totals unchanged", () => {
  const base = use({ amount: 24000, pay_plan: "emi", emi_months: 6, due_on: "2026-11-30" });
  for (const u of [base, { ...base, emi_charges: 0 }, { ...base, emi_charges: undefined }]) {
    assert.equal(owedOf(u), 24000);
    assert.deepEqual(installmentsOf(u).map((s) => s.amount), legacyInstallments(base).map((s) => s.amount), "same as the pre-change rule");
  }
});

test("AFTER: EMI charges are owed by the buyer and spread over the installments (last absorbs rounding)", () => {
  const u = use({ amount: 24000, pay_plan: "emi", emi_months: 6, due_on: "2026-11-30", emi_charges: 1000 });
  assert.equal(owedOf(u), 25000);
  const s = installmentsOf(u);
  assert.deepEqual(s.map((x) => x.amount), [4166.66, 4166.66, 4166.66, 4166.66, 4166.66, 4166.7]);
  assert.equal(Math.round(s.reduce((t, x) => t + x.amount * 100, 0)) / 100, 25000);
  const st = cardPlanStatus(data({ cardUses: [u], repayments: [rep({ amount: 4166.66 })] }), "c1").get("u1");
  assert.deepEqual([st.principal, st.charges, st.amount, st.perMonth, st.paidCount, st.left], [24000, 1000, 25000, 4166.66, 1, 20833.34]);
});

test("AFTER: charges flow into what the person owes, per card and overall", () => {
  const d = data({ cardUses: [use({ amount: 600, pay_plan: "emi", emi_months: 3, due_on: "2026-12-01", emi_charges: 30 })], repayments: [rep({ amount: 100 })] });
  const [card] = buildCardProfiles(d, "c1", "2026-11-19");
  assert.equal(card.used, 630);
  assert.equal(card.owes, 530);
  const [p] = buildProfiles(d, "2026-11-19");
  assert.equal(p.cardTotal, 630);
  assert.deepEqual(p.cardOutByCard, { c1: 530 });
  assert.equal(p.events.find((e) => e.kind === "Used my card").amount, 630, "history uses the amount owed so 'owes after' reconciles");
});
