// Monthly / yearly report rows. Each ledger event lands in exactly ONE column of ONE period, so columns can be
// added up without double counting; "receivables at period end" is a balance (from lib/history), not a flow.
// Pure; tested in tests/reports.test.mjs.
import { cardPlanStatus, owedOf } from "./ledger.ts";
import { receivablesAsOf } from "./history.ts";
import { sumBy } from "./money.ts";
import type { FinanceData } from "./types.ts";
import type { ResearchData } from "./research.ts";

export type ReportRow = {
  key: string;               // "2026-11" or "2026"
  lentLoans: number;         // bank loans given (cash out only if funded from the bank)
  lentCard: number;          // others' card purchases incl. EMI charges (card liability, not cash)
  ownCard: number;           // your own card spending
  collectedLoans: number;    // repayments for loans
  collectedCard: number;     // repayments for card purchases
  creditedToBank: number;    // the subset of collectedLoans recorded as added to the bank
  emiDue: number;            // EMI installments falling due in the period (scheduled, not flows)
  receivablesEnd: number;    // what people owed at the end of the period
  researchSpent: number;
  researchContributed: number;
};

const lastDayOf = (key: string) => {
  if (key.length === 4) return `${key}-12-31`;
  const [y, m] = key.split("-").map(Number);
  return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

export function reportRows(data: FinanceData, research: ResearchData, mode: "month" | "year", today: string): ReportRow[] {
  const keyOf = (iso: string) => (mode === "year" ? iso.slice(0, 4) : iso.slice(0, 7));
  const dates = [...data.loans.map((l) => l.taken_on), ...data.cardUses.map((u) => u.used_on), ...data.repayments.map((r) => r.paid_on),
    ...research.expenses.map((e) => e.spent_on), ...research.contributions.map((c) => c.paid_on)].filter((d) => d <= today).sort();
  if (!dates.length) return [];
  const keys: string[] = [];
  if (mode === "year") for (let y = Number(dates[0].slice(0, 4)); y <= Number(today.slice(0, 4)); y++) keys.push(String(y));
  else {
    let [y, m] = dates[0].slice(0, 7).split("-").map(Number);
    const end = today.slice(0, 7);
    for (;;) { const k = `${y}-${String(m).padStart(2, "0")}`; keys.push(k); if (k >= end) break; m++; if (m > 12) { m = 1; y++; } }
  }
  const installments = data.cards.flatMap((c) => [...cardPlanStatus(data, c.id).values()].filter((s) => s.plan === "emi").flatMap((s) => s.installments));
  const inK = (k: string) => (iso: string) => keyOf(iso) === k;

  return keys.map((k) => {
    const is = inK(k);
    const reps = data.repayments.filter((r) => is(r.paid_on));
    const end = lastDayOf(k) < today ? lastDayOf(k) : today;
    return {
      key: k,
      lentLoans: sumBy(data.loans.filter((l) => is(l.taken_on)), (l) => l.amount),
      lentCard: sumBy(data.cardUses.filter((u) => u.person_id && is(u.used_on)), owedOf),
      ownCard: sumBy(data.cardUses.filter((u) => !u.person_id && is(u.used_on)), (u) => u.amount),
      collectedLoans: sumBy(reps.filter((r) => r.applies_to === "loan"), (r) => r.amount),
      collectedCard: sumBy(reps.filter((r) => r.applies_to === "card"), (r) => r.amount),
      creditedToBank: sumBy(reps.filter((r) => r.account_id), (r) => r.amount),
      emiDue: sumBy(installments.filter((i) => is(i.iso)), (i) => i.amount),
      receivablesEnd: receivablesAsOf(data, end).total,
      researchSpent: sumBy(research.expenses.filter((e) => is(e.spent_on)), (e) => e.amount),
      researchContributed: sumBy(research.contributions.filter((c) => is(c.paid_on)), (c) => c.amount),
    };
  }).reverse();
}
