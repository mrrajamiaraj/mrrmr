// Lending figures for the People & loans charts. Pure and exact (integer paisa via lib/money); tested in
// tests/people-stats.test.mjs. Inputs are the already-tested outputs of lib/dashboard (open items), lib/trends (monthly
// series) and lib/statement (one person's running balance), so no balance is recomputed here.
import { subMoney, sumBy } from "./money.ts";
import { nextMonth, type MonthFlow } from "./research-stats.ts";
import { owedOf } from "./ledger.ts";
import type { FinanceData } from "./types.ts";

type Open = { personId: string; iso: string | null; left: number };

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export type AgingKey = "late60" | "late30" | "late1" | "week" | "later" | "undated";
export type AgingBucket = { key: AgingKey; label: string; amount: number; count: number; people: number };

const AGING: [AgingKey, string][] = [
  ["late60", "Over 60 days late"], ["late30", "31–60 days late"], ["late1", "1–30 days late"],
  ["week", "Due in the next 7 days"], ["later", "Due later"], ["undated", "No due date"],
];

export function agingKey(iso: string | null, today: string): AgingKey {
  if (!iso) return "undated";
  const d = dayDiff(iso, today); // days late (positive) or early (negative)
  if (d > 60) return "late60";
  if (d > 30) return "late30";
  if (d > 0) return "late1";
  return -d <= 7 ? "week" : "later";
}

/** What's still owed, grouped by how late it is. Every bucket is present (zeros included), most urgent first. */
export function aging(open: Open[], today: string): AgingBucket[] {
  return AGING.map(([key, label]) => {
    const items = open.filter((o) => agingKey(o.iso, today) === key);
    return { key, label, amount: sumBy(items, (o) => o.left), count: items.length, people: new Set(items.map((o) => o.personId)).size };
  });
}

/** Amount falling due per day (dated items only), keyed by YYYY-MM-DD. */
export function dueCalendar(open: Open[]) {
  const map = new Map<string, { total: number; count: number }>();
  for (const o of open) {
    if (!o.iso) continue;
    const d = map.get(o.iso) ?? { total: 0, count: 0 };
    map.set(o.iso, { total: sumBy([d.total, o.left], (x) => x), count: d.count + 1 });
  }
  return map;
}

/** What money was lent for: loan reasons and others' card purchases (by category, else place), biggest first. */
export function lentFor(data: FinanceData) {
  const rows = [
    ...data.loans.map((l) => ({ name: l.reason.trim() || "Other", amount: l.amount })),
    ...data.cardUses.filter((u) => u.person_id).map((u) => ({ name: (u.category || u.reason_or_place || "Card purchase").trim(), amount: owedOf(u) })),
  ];
  const whole = sumBy(rows, (r) => r.amount);
  const names = [...new Set(rows.map((r) => r.name))];
  return names
    .map((name) => {
      const R = rows.filter((r) => r.name === name);
      const total = sumBy(R, (r) => r.amount);
      return { name, total, count: R.length, share: whole ? Math.round((total / whole) * 1000) / 10 : 0 };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/**
 * The lending series as chart months: "spent" = lent out, "contributed" = paid back, "running" = owed at month end.
 * (The research chart's field names, so the same FlowChart draws both.)
 */
export function lendingMonths(series: { key: string; lent: number; repaid: number; owedEnd: number }[]): MonthFlow[] {
  return series.map((m) => ({ key: m.key, spent: m.lent, contributed: m.repaid, net: subMoney(m.repaid, m.lent), running: m.owedEnd, count: 0 }));
}

/**
 * One person's statement as chart months, from their first entry to their last (gaps filled): borrowed, repaid and
 * the balance they owed at the month's end (the last running balance in the month, carried through empty months).
 */
export function personMonths(rows: { iso: string; borrowed: number | null; repaid: number | null; balance: number }[]): MonthFlow[] {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => a.iso.localeCompare(b.iso));
  const out: MonthFlow[] = [];
  let balance = 0;
  const last = sorted[sorted.length - 1].iso.slice(0, 7);
  for (let k = sorted[0].iso.slice(0, 7); k <= last; k = nextMonth(k)) {
    const R = sorted.filter((r) => r.iso.startsWith(k));
    const spent = sumBy(R, (r) => r.borrowed ?? 0);
    const contributed = sumBy(R, (r) => r.repaid ?? 0);
    if (R.length) balance = R[R.length - 1].balance;
    out.push({ key: k, spent, contributed, net: subMoney(contributed, spent), running: balance, count: R.length });
  }
  return out;
}
