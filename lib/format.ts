const MON = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ৳1,43,345 — always positive; callers add their own sign. */
export function taka(n: number) {
  return "৳" + Math.round(Math.abs(n)).toLocaleString("en-IN");
}

/**
 * ৳353.33 — like `taka`, but keeps the paisa when an amount isn't whole. For installment amounts, where rounding to
 * whole taka would hide the very difference being explained (৳353.33 vs a last installment of ৳353.35).
 */
export function takaExact(n: number) {
  const a = Math.abs(n);
  return "৳" + (Math.round(a * 100) % 100 === 0 ? Math.round(a).toLocaleString("en-IN") : a.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

/** Today's date (YYYY-MM-DD) in Bangladesh time. */
export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Same day n months later, clamped to the month's last day (Jan 31 + 1 → Feb 28). */
export function addMonths(iso: string, n: number) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 86400000);
}

/** "Oct 12, 2026" */
export function dateLong(iso: string | null | undefined, empty = "Not set") {
  if (!iso) return empty;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${MON[Number(m)]} ${Number(d)}, ${y}`;
}

/** "Oct 12" */
export function dateShort(iso: string | null | undefined, empty = "Not set") {
  if (!iso) return empty;
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${MON[Number(m)]} ${Number(d)}`;
}

/** "Oct 2026" */
export function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${MON[Number(m)]} ${y}`;
}

/** Timestamp → "Oct 12, 2026" in Bangladesh time. */
export function timestampLong(ts: string | null | undefined) {
  if (!ts) return "—";
  return dateLong(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date(ts)));
}

export function initials(name: string) {
  return name
    .replace(/\(.*\)/, "")
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function pct(part: number, whole: number, digits = 0) {
  if (!whole) return 0;
  const f = 10 ** digits;
  return Math.round((part / whole) * 100 * f) / f;
}
