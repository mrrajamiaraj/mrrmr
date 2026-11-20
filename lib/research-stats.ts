// Research ledger figures for the charts. Pure and exact (integer paisa via lib/money); tested in
// tests/research-stats.test.mjs. Nothing here touches personal bank, card or loan figures.
import { subMoney, sumBy } from "./money.ts";
import type { ResearchContribution, ResearchExpense } from "./research.ts";

/** "2026-01" → "2026-02" */
export function nextMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export type MonthFlow = {
  key: string;
  spent: number;
  contributed: number;
  /** contributed − spent in this month */
  net: number;
  /** contributed − spent from the first month through this one */
  running: number;
  count: number;
};

/** One row per month from the first record to the last, gaps filled with zeros, oldest first. */
export function monthlyFlow(expenses: ResearchExpense[], contributions: ResearchContribution[]): MonthFlow[] {
  const keys = [...expenses.map((e) => e.spent_on.slice(0, 7)), ...contributions.map((c) => c.paid_on.slice(0, 7))].sort();
  if (!keys.length) return [];
  const out: MonthFlow[] = [];
  let running = 0;
  for (let k = keys[0]; k <= keys[keys.length - 1]; k = nextMonth(k)) {
    const E = expenses.filter((e) => e.spent_on.startsWith(k));
    const spent = sumBy(E, (e) => e.amount);
    const contributed = sumBy(contributions.filter((c) => c.paid_on.startsWith(k)), (c) => c.amount);
    const net = subMoney(contributed, spent);
    running = sumBy([running, net], (x) => x);
    out.push({ key: k, spent, contributed, net, running, count: E.length });
  }
  return out;
}

export type CumPoint = { key: string; spent: number; contributed: number };

/** Cumulative spent and contributed at the end of each month (both only ever rise). */
export function cumulative(flow: MonthFlow[]): CumPoint[] {
  let s = 0, c = 0;
  return flow.map((m) => {
    s = sumBy([s, m.spent], (x) => x);
    c = sumBy([c, m.contributed], (x) => x);
    return { key: m.key, spent: s, contributed: c };
  });
}

export type Slice = { name: string; total: number; count: number; avg: number; share: number };

/** Totals grouped by one field, biggest first; names with nothing recorded are left out. Shares are % to 1 decimal. */
export function breakdown<T>(rows: T[], nameOf: (r: T) => string, amountOf: (r: T) => number, order: string[] = []): Slice[] {
  const names = [...order];
  for (const r of rows) if (!names.includes(nameOf(r))) names.push(nameOf(r));
  const whole = sumBy(rows, amountOf);
  return names
    .map((name) => {
      const R = rows.filter((r) => nameOf(r) === name);
      const total = sumBy(R, amountOf);
      return { name, total, count: R.length, avg: R.length ? Math.round((total / R.length) * 100) / 100 : 0, share: whole ? Math.round((total / whole) * 1000) / 10 : 0 };
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export type Cell = { facility: string; member: string; total: number; count: number };

/** Spending for every facility × member pair (zeros included, so the grid is complete). */
export function matrix(expenses: ResearchExpense[], facilities: string[], members: string[]) {
  const cells: Cell[] = [];
  for (const facility of facilities) for (const member of members) {
    const R = expenses.filter((e) => e.facility === facility && e.member === member);
    cells.push({ facility, member, total: sumBy(R, (e) => e.amount), count: R.length });
  }
  return { cells, max: Math.max(0, ...cells.map((c) => c.total)) };
}

/** Spending per day, keyed by YYYY-MM-DD. */
export function dailyTotals(expenses: ResearchExpense[]) {
  const map = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    const d = map.get(e.spent_on) ?? { total: 0, count: 0 };
    map.set(e.spent_on, { total: sumBy([d.total, e.amount], (x) => x), count: d.count + 1 });
  }
  return map;
}

export type MemberBalance = { name: string; contributed: number; spent: number; net: number; logs: number; share: number };

/** Each member's contributions against what they paid for. Shares are of all contributions, % to 1 decimal. */
export function memberBalances(expenses: ResearchExpense[], contributions: ResearchContribution[], members: string[]): MemberBalance[] {
  const totalCon = sumBy(contributions, (c) => c.amount);
  return members.map((name) => {
    const C = contributions.filter((c) => c.member === name);
    const contributed = sumBy(C, (c) => c.amount);
    const spent = sumBy(expenses.filter((e) => e.member === name), (e) => e.amount);
    return { name, contributed, spent, net: subMoney(contributed, spent), logs: C.length, share: totalCon ? Math.round((contributed / totalCon) * 1000) / 10 : 0 };
  });
}
