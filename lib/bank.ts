// Recorded bank movements for one account, derived from ledger rows only (owner decision 2026-11-19: show what is
// recorded, labelled as partial). Pure; tested in tests/bank.test.mjs.
//
// What the data CAN tell us:
//   • Repayment credited to the account — a repayment stores account_id only when it was added to the balance
//     (lib/actions recordRepayment), so these are real inflows.
//   • Loan made from the account — recorded, but whether it was deducted from the balance was never stored.
// What it CANNOT tell us (so it is never shown as a movement): manual balance edits, individual debit-card entries
// (only a running total exists), and any money moved outside the app.
import { sumBy } from "./money.ts";
import type { FinanceData } from "./types.ts";

export type BankMovement = {
  id: string;
  iso: string;
  created: string;
  kind: "credit" | "loan";
  personId: string;
  name: string;
  amount: number;
  detail: string;
  /** credit: added to the balance when recorded · loan: whether it was deducted isn't recorded */
  effect: "credited" | "unknown";
};

export type BankMonth = { ym: string; credited: number; loansMade: number };

export type BankBorrower = {
  personId: string;
  name: string;
  relation: string | null;
  phone: string | null;
  /** loans recorded as taken from this account, newest first */
  loans: { id: string; iso: string; amount: number; reason: string; method: string; due: string | null }[];
  /** total of those loans */
  taken: number;
  /** repayments credited back into this account */
  creditedBack: number;
  first: string;
  last: string;
};

/**
 * Who has taken money from this account: every person with at least one loan recorded against it, with each loan's
 * details. Biggest total first. Only loans that name this account count; cash or other-source loans don't.
 */
export function bankBorrowers(data: FinanceData, accountId: string): BankBorrower[] {
  const out = new Map<string, BankBorrower>();
  for (const l of data.loans.filter((x) => x.account_id === accountId)) {
    const p = data.people.find((x) => x.id === l.person_id);
    const b = out.get(l.person_id) ?? {
      personId: l.person_id, name: p?.name ?? "Unknown", relation: p?.relation ?? null, phone: p?.phone ?? null,
      loans: [], taken: 0, creditedBack: 0, first: l.taken_on, last: l.taken_on,
    };
    b.loans.push({ id: l.id, iso: l.taken_on, amount: l.amount, reason: l.reason, method: l.method, due: l.due_on ?? null });
    b.taken = sumBy([b.taken, l.amount], (x) => x);
    if (l.taken_on < b.first) b.first = l.taken_on;
    if (l.taken_on > b.last) b.last = l.taken_on;
    out.set(l.person_id, b);
  }
  for (const b of out.values()) {
    b.loans.sort((x, y) => y.iso.localeCompare(x.iso));
    b.creditedBack = sumBy(data.repayments.filter((r) => r.account_id === accountId && r.person_id === b.personId), (r) => r.amount);
  }
  return [...out.values()].sort((a, b) => b.taken - a.taken || a.name.localeCompare(b.name));
}

export function bankMovements(data: FinanceData, accountId: string): { rows: BankMovement[]; months: BankMonth[] } {
  const names = new Map(data.people.map((p) => [p.id, p.name]));
  const rows: BankMovement[] = [
    ...data.repayments.filter((r) => r.account_id === accountId).map((r): BankMovement => ({
      id: r.id, iso: r.paid_on, created: r.created_at, kind: "credit", personId: r.person_id, name: names.get(r.person_id) ?? "Unknown",
      amount: r.amount, detail: `Loan repayment via ${r.via}`, effect: "credited",
    })),
    ...data.loans.filter((l) => l.account_id === accountId).map((l): BankMovement => ({
      id: l.id, iso: l.taken_on, created: l.created_at, kind: "loan", personId: l.person_id, name: names.get(l.person_id) ?? "Unknown",
      amount: l.amount, detail: `${l.reason} · ${l.method}`, effect: "unknown",
    })),
  ].sort((a, b) => b.iso.localeCompare(a.iso) || b.created.localeCompare(a.created));

  const byMonth = new Map<string, BankMonth>();
  for (const m of rows) {
    const ym = m.iso.slice(0, 7);
    const b = byMonth.get(ym) ?? { ym, credited: 0, loansMade: 0 };
    if (m.kind === "credit") b.credited = sumBy([b.credited, m.amount], (x) => x);
    else b.loansMade = sumBy([b.loansMade, m.amount], (x) => x);
    byMonth.set(ym, b);
  }
  return { rows, months: [...byMonth.values()].sort((a, b) => b.ym.localeCompare(a.ym)) };
}
