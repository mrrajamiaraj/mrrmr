// Server-side input validation shared by every server action. No framework imports, so tests run it directly.
// The forms are not the only way to call server actions, so nothing here trusts the client.

/** numeric(14,2) holds up to 999,999,999,999.99; anything at or above ৳100 billion is a typo or an attack. */
export const MAX_AMOUNT = 99_999_999_999.99;

/** A real calendar date "YYYY-MM-DD" within a sane range (1990 → 2100). Rejects "2026-02-30", "2026-13-01", "abc". */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return y >= 1990 && y <= 2100 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Optional date: "" / null / undefined is fine (the database default applies); anything else must be a real date. */
export function optionalDate(s: unknown): { ok: true; value: string | null } | { ok: false } {
  if (s == null || s === "") return { ok: true, value: null };
  return isIsoDate(s) ? { ok: true, value: s } : { ok: false };
}

/** Positive amount within range (already rounded to paisa by the caller). */
export const amountInRange = (n: number) => Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT;

/** UUID v4-ish shape (what Postgres gen_random_uuid() produces). */
export const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
