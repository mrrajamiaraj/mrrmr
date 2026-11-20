// Repayment (collections) figures for the Repayments page. Pure and exact (integer paisa via lib/money); tested in
// tests/collections-stats.test.mjs. Inputs are recorded repayments only — no balance is recomputed here; what is
// still owed comes from lib/dashboard and lib/ledger as everywhere else.
import { subMoney, sumBy } from "./money.ts";
import { addDays } from "./format.ts";
import { nextMonth } from "./research-stats.ts";
import type { Repayment } from "./types.ts";

type Rep = Pick<Repayment, "person_id" | "amount" | "paid_on" | "via" | "applies_to" | "card_id" | "account_id">;

/** "2026-03" minus k months */
export function monthsBack(ym: string, k: number) {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) - k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export type CollectMonth = { key: string; total: number; intoBank: number; other: number; loan: number; card: number; count: number };

/** The last `n` calendar months up to today's month (oldest first, empty months included). */
export function collectionMonths(reps: Rep[], today: string, n = 12): CollectMonth[] {
  const out: CollectMonth[] = [];
  for (let k = monthsBack(today.slice(0, 7), n - 1), i = 0; i < n; k = nextMonth(k), i++) {
    const R = reps.filter((r) => r.paid_on.startsWith(k) && r.paid_on <= today);
    const total = sumBy(R, (r) => r.amount);
    const intoBank = sumBy(R.filter((r) => r.account_id), (r) => r.amount);
    out.push({
      key: k, total, intoBank, other: subMoney(total, intoBank),
      loan: sumBy(R.filter((r) => r.applies_to === "loan"), (r) => r.amount),
      card: sumBy(R.filter((r) => r.applies_to === "card"), (r) => r.amount),
      count: R.length,
    });
  }
  return out;
}

export type CollectWeek = { start: string; end: string; total: number; count: number };

/** Rolling 7-day windows ending today (the last window is today and the six days before), oldest first. */
export function collectionWeeks(reps: Rep[], today: string, n = 12): CollectWeek[] {
  return Array.from({ length: n }, (_, i) => {
    const end = addDays(today, -7 * (n - 1 - i));
    const start = addDays(end, -6);
    const R = reps.filter((r) => r.paid_on >= start && r.paid_on <= end);
    return { start, end, total: sumBy(R, (r) => r.amount), count: R.length };
  });
}

/** Amount collected per day, keyed by YYYY-MM-DD (future-dated entries left out). */
export function collectionDays(reps: Rep[], today: string) {
  const map = new Map<string, { total: number; count: number }>();
  for (const r of reps) {
    if (r.paid_on > today) continue;
    const d = map.get(r.paid_on) ?? { total: 0, count: 0 };
    map.set(r.paid_on, { total: sumBy([d.total, r.amount], (x) => x), count: d.count + 1 });
  }
  return map;
}

/** This window's total against the window of the same length just before it. `change` is % (null when nothing before). */
export function pace(reps: Rep[], today: string, days = 30) {
  const since = addDays(today, -(days - 1));
  const before = addDays(since, -days);
  const now = sumBy(reps.filter((r) => r.paid_on >= since && r.paid_on <= today), (r) => r.amount);
  const prev = sumBy(reps.filter((r) => r.paid_on >= before && r.paid_on < since), (r) => r.amount);
  return { now, prev, since, change: prev ? Math.round(((now - prev) / prev) * 1000) / 10 : null };
}

export type Payer = { id: string; total: number; count: number; last: string };

/** Who paid back the most (in the given rows), biggest first; ties by most recent payment. */
export function payers(reps: Rep[]): Payer[] {
  const m = new Map<string, Rep[]>();
  for (const r of reps) m.set(r.person_id, [...(m.get(r.person_id) ?? []), r]);
  return [...m.entries()]
    .map(([id, R]) => ({ id, total: sumBy(R, (r) => r.amount), count: R.length, last: R.map((r) => r.paid_on).sort().at(-1)! }))
    .sort((a, b) => b.total - a.total || b.last.localeCompare(a.last));
}

/** The payment list's filters — one definition for the list and its totals. */
export type RepFilter = { q?: string; month?: string; day?: string; via?: string; to?: string; bank?: "yes" | "no" };

/** `to` is "loan" or a card id. `text` adds searchable words for a row (the person's name, the card's name). */
export function filterRepayments<T extends Rep>(reps: T[], f: RepFilter, text: (r: T) => string = () => "") {
  const q = (f.q ?? "").trim().toLowerCase();
  return reps.filter((r) =>
    (!f.month || r.paid_on.startsWith(f.month)) && (!f.day || r.paid_on === f.day) && (!f.via || r.via === f.via) &&
    (!f.to || (f.to === "loan" ? r.applies_to === "loan" : r.applies_to === "card" && r.card_id === f.to)) &&
    (!f.bank || (f.bank === "yes") === Boolean(r.account_id)) &&
    (!q || `${text(r)} ${r.via} ${r.paid_on} ${r.amount}`.toLowerCase().includes(q)));
}
