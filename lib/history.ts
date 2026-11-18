// Financial time machine: what can be reconstructed for a past date, and ONLY that.
//
// Reconstructible (every event is dated and stored): receivables — loans, card uses (incl. EMI charges) and
// repayments up to the date — and the research ledger (expenses and contributions up to the date).
// NOT reconstructible: the bank balance and card balances. They are single stored numbers, overwritten by manual
// edits and debit-card entries, with no dated history. The time machine says so instead of guessing.
// Also: a record deleted later is gone from history, so past figures reflect today's records only.
import { owedOf } from "./ledger.ts";
import { subMoney, sumBy } from "./money.ts";
import type { FinanceData } from "./types.ts";
import type { ResearchData } from "./research.ts";

export type Receivables = { bankLoans: number; byCard: Record<string, number>; cards: number; total: number; people: number };

/** What people owed you at the END of `date` (events dated on or before it), per source, never below 0 per source. */
export function receivablesAsOf(data: FinanceData, date: string): Receivables {
  let bankLoans = 0;
  const byCard: Record<string, number> = Object.fromEntries(data.cards.map((c) => [c.id, 0]));
  let people = 0;
  for (const p of data.people) {
    const loanOwed = Math.max(subMoney(
      sumBy(data.loans.filter((l) => l.person_id === p.id && l.taken_on <= date), (l) => l.amount),
      sumBy(data.repayments.filter((r) => r.person_id === p.id && r.applies_to === "loan" && r.paid_on <= date), (r) => r.amount)), 0);
    let any = loanOwed > 0;
    bankLoans = sumBy([bankLoans, loanOwed], (x) => x);
    for (const c of data.cards) {
      const owed = Math.max(subMoney(
        sumBy(data.cardUses.filter((u) => u.person_id === p.id && u.card_id === c.id && u.used_on <= date), owedOf),
        sumBy(data.repayments.filter((r) => r.person_id === p.id && r.applies_to === "card" && r.card_id === c.id && r.paid_on <= date), (r) => r.amount)), 0);
      if (owed > 0) any = true;
      byCard[c.id] = sumBy([byCard[c.id], owed], (x) => x);
    }
    if (any) people++;
  }
  const cards = sumBy(Object.values(byCard), (x) => x);
  return { bankLoans, byCard, cards, total: sumBy([bankLoans, cards], (x) => x), people };
}

export type ResearchPosition = { spent: number; contributed: number; net: number };

export function researchAsOf(r: ResearchData, date: string): ResearchPosition {
  const spent = sumBy(r.expenses.filter((e) => e.spent_on <= date), (e) => e.amount);
  const contributed = sumBy(r.contributions.filter((c) => c.paid_on <= date), (c) => c.amount);
  return { spent, contributed, net: subMoney(contributed, spent) };
}

export type TimeMachine = {
  date: string;
  then: { receivables: Receivables; research: ResearchPosition };
  now: { receivables: Receivables; research: ResearchPosition };
  /** activity between the date (exclusive) and today (inclusive) — the "why it changed" */
  since: { lent: number; cardUse: number; repaid: number; researchSpent: number; researchContributed: number };
  firstRecord: string | null;
};

export function timeMachine(data: FinanceData, research: ResearchData, date: string, today: string): TimeMachine {
  const after = (iso: string) => iso > date && iso <= today;
  const dates = [...data.loans.map((l) => l.taken_on), ...data.cardUses.map((u) => u.used_on), ...data.repayments.map((r) => r.paid_on),
    ...research.expenses.map((e) => e.spent_on), ...research.contributions.map((c) => c.paid_on)].sort();
  return {
    date,
    then: { receivables: receivablesAsOf(data, date), research: researchAsOf(research, date) },
    now: { receivables: receivablesAsOf(data, today), research: researchAsOf(research, today) },
    since: {
      lent: sumBy(data.loans.filter((l) => after(l.taken_on)), (l) => l.amount),
      cardUse: sumBy(data.cardUses.filter((u) => u.person_id && after(u.used_on)), owedOf),
      repaid: sumBy(data.repayments.filter((r) => after(r.paid_on)), (r) => r.amount),
      researchSpent: sumBy(research.expenses.filter((e) => after(e.spent_on)), (e) => e.amount),
      researchContributed: sumBy(research.contributions.filter((c) => after(c.paid_on)), (c) => c.amount),
    },
    firstRecord: dates[0] ?? null,
  };
}
