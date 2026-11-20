// Recorded bank movements for one account, derived from ledger rows only (owner decision 2026-11-19: show what is
// recorded, labelled as partial). Pure; tested in tests/bank.test.mjs.
//
// What the data CAN tell us:
//   • Repayment credited to the account — a repayment stores account_id only when it was added to the balance
//     (lib/actions recordRepayment), so these are real inflows.
//   • Loan made from the account — recorded, but whether it was deducted from the balance was never stored.
// What it CANNOT tell us (so it is never shown as a movement): manual balance edits, individual debit-card entries
// (only a running total exists), and any money moved outside the app.
import { subMoney, sumBy } from "./money.ts";
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

export type OutlookStep = {
  /** "overdue" (due before today: could come in any time), a due date, or "undated" (no pay-back date set) */
  kind: "overdue" | "dated" | "undated";
  iso: string | null;
  /** what comes in at this step */
  amount: number;
  /** the account balance once this step (and every earlier one) has been paid back into it */
  balance: number;
  people: { personId: string; name: string; amount: number }[];
};

/**
 * What the account balance becomes as people pay back their loans into it, step by step in due-date order:
 * overdue money first, then each due date, then loans with no date. Assumes every repayment goes into the account
 * (the projection is labelled as such). Inputs are the open loan items from lib/dashboard, so nothing is recomputed.
 */
export function bankOutlook(balance: number, open: { source: "loan" | "card"; personId: string; name: string; iso: string | null; left: number }[], personIds: Iterable<string>, today: string) {
  const who = new Set(personIds);
  const items = open.filter((o) => o.source === "loan" && who.has(o.personId) && o.left > 0);
  const groups = new Map<string, OutlookStep>();
  for (const o of items) {
    const kind: OutlookStep["kind"] = !o.iso ? "undated" : o.iso < today ? "overdue" : "dated";
    const key = kind === "dated" ? o.iso! : kind;
    const g = groups.get(key) ?? { kind, iso: kind === "dated" ? o.iso : null, amount: 0, balance: 0, people: [] };
    g.amount = sumBy([g.amount, o.left], (x) => x);
    const p = g.people.find((x) => x.personId === o.personId);
    if (p) p.amount = sumBy([p.amount, o.left], (x) => x);
    else g.people.push({ personId: o.personId, name: o.name, amount: o.left });
    groups.set(key, g);
  }
  const order = (s: OutlookStep) => (s.kind === "overdue" ? "0" : s.kind === "dated" ? `1${s.iso}` : "2");
  let run = balance;
  const steps = [...groups.values()].sort((a, b) => order(a).localeCompare(order(b))).map((s) => {
    run = sumBy([run, s.amount], (x) => x);
    return { ...s, balance: run, people: s.people.sort((a, b) => b.amount - a.amount) };
  });
  const expected = sumBy(steps, (s) => s.amount);
  return { now: balance, expected, after: sumBy([balance, expected], (x) => x), steps };
}

export type LoanLine = {
  id: string; iso: string; kind: "loan" | "repayment"; amount: number; detail: string;
  /** loan: taken from this account · repayment: paid into this account */
  viaAccount: boolean;
  /** what the person owes on loans after this line */
  owes: number;
};

/** One person's loans and loan repayments in date order with a running total of what they still owe on loans. */
export function loanLedger(data: FinanceData, personId: string, accountId: string): LoanLine[] {
  const rows = [
    ...data.loans.filter((l) => l.person_id === personId).map((l) => ({ id: l.id, iso: l.taken_on, created: l.created_at, kind: "loan" as const, amount: l.amount, detail: `${l.reason} · ${l.method}`, viaAccount: l.account_id === accountId })),
    ...data.repayments.filter((r) => r.person_id === personId && r.applies_to === "loan").map((r) => ({ id: r.id, iso: r.paid_on, created: r.created_at, kind: "repayment" as const, amount: r.amount, detail: `Paid back via ${r.via}`, viaAccount: r.account_id === accountId })),
  ].sort((a, b) => a.iso.localeCompare(b.iso) || (a.kind === b.kind ? 0 : a.kind === "loan" ? -1 : 1) || a.created.localeCompare(b.created));
  let owes = 0;
  return rows.map(({ created: _c, ...r }) => {
    owes = r.kind === "loan" ? sumBy([owes, r.amount], (x) => x) : subMoney(owes, r.amount);
    return { ...r, owes };
  });
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
