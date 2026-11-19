// Month-by-month series for the charts: what people owed you at each month end, and what was lent out and paid back
// during each month. Built only from dated ledger rows (the same rules as lib/reports and lib/history), so every point
// is reconstructible — bank and card balances are NOT charted over time because they have no dated history.
// Pure; tested in tests/trends.test.mjs. Relative imports so Node's test runner can load it.
import { receivablesAsOf } from "./history.ts";
import { owedOf } from "./ledger.ts";
import { sumBy } from "./money.ts";
import { monthLabel } from "./format.ts";
import type { FinanceData } from "./types.ts";

export type MonthPoint = {
  key: string;        // "2026-11"
  label: string;      // "Nov 2026"
  short: string;      // "Nov"
  owedEnd: number;    // what people owed you at the end of the month (today, for the current month)
  lent: number;       // bank loans + other people's card purchases dated in the month
  repaid: number;     // repayments dated in the month
};

const lastDay = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
const shift = (ym: string, by: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

/** The last `n` months up to and including today's month, oldest first. */
export function monthlySeries(data: FinanceData, today: string, n = 12): MonthPoint[] {
  const end = today.slice(0, 7);
  const keys = Array.from({ length: n }, (_, i) => shift(end, i - (n - 1)));
  return keys.map((key) => {
    const inMonth = (iso: string) => iso.startsWith(key) && iso <= today;
    const close = lastDay(key) < today ? lastDay(key) : today;
    return {
      key, label: monthLabel(key), short: monthLabel(key).split(" ")[0],
      owedEnd: receivablesAsOf(data, close).total,
      lent: sumBy([
        sumBy(data.loans.filter((l) => inMonth(l.taken_on)), (l) => l.amount),
        sumBy(data.cardUses.filter((u) => u.person_id && inMonth(u.used_on)), owedOf),
      ], (x) => x),
      repaid: sumBy(data.repayments.filter((r) => inMonth(r.paid_on)), (r) => r.amount),
    };
  });
}
