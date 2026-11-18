// Decimal-safe money helpers. Every amount in the database is numeric(14,2): whole taka plus two paisa digits.
// JavaScript numbers can't hold most decimals exactly (0.1 + 0.2 !== 0.3), so arithmetic here happens in integer
// paisa, which a double represents exactly up to ±9,007,199,254,740,991 (≈ ৳90 trillion, far above numeric(14,2)).
// Values cross the API boundary as ordinary numbers (p / 100), the closest double to the exact decimal.
//
// No framework imports, so tests/money.test.mjs can run this file directly under Node.

/** Converts an amount (number or numeric string such as "1234.50") to integer paisa. NaN if it isn't a finite amount. */
export function toPaisa(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return NaN;
    return decimalToPaisa(String(value));
  }
  if (typeof value === "string") {
    const s = value.trim().replace(/,/g, "");
    if (!s) return NaN;
    return decimalToPaisa(s);
  }
  if (typeof value === "bigint") return Number(value) * 100;
  return NaN;
}

/**
 * Exact decimal-string rounding to paisa, half away from zero on the third decimal ("1.005" → 101).
 * Multiplying the double instead would give Math.round(1.005 * 100) = 100, because 1.005 is stored as 1.00499….
 */
function decimalToPaisa(s: string): number {
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) {
    // Exponent form ("1e-7", "1.5e+21"): too small to matter or beyond numeric(14,2); round the double.
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  }
  const [, sign, int = "", frac = ""] = m;
  if (!int && !frac) return NaN;
  const whole = Number(int || "0");
  const cents = Number((frac + "00").slice(0, 2));
  const roundUp = (frac[2] ?? "0") >= "5" ? 1 : 0;
  const p = whole * 100 + cents + roundUp;
  return sign === "-" ? -p : p;
}

/** Integer paisa back to a taka amount (e.g. 143345050 → 1433450.5). */
export function fromPaisa(paisa: number): number {
  return paisa / 100;
}

/** Rounds any amount to exactly two decimals. NaN in, NaN out. */
export function roundMoney(value: unknown): number {
  const p = toPaisa(value);
  return Number.isNaN(p) ? NaN : fromPaisa(p);
}

/** Exact sum of amounts. Missing/invalid entries count as 0 (same as the totals this replaces). */
export function sumMoney(values: Iterable<unknown>): number {
  let p = 0;
  for (const v of values) {
    const x = toPaisa(v);
    if (!Number.isNaN(x)) p += x;
  }
  return fromPaisa(p);
}

/** Exact sum of one numeric field over rows, e.g. sumBy(loans, (l) => l.amount). */
export function sumBy<T>(rows: Iterable<T>, pick: (row: T) => unknown): number {
  let p = 0;
  for (const r of rows) {
    const x = toPaisa(pick(r));
    if (!Number.isNaN(x)) p += x;
  }
  return fromPaisa(p);
}

/** a − b, exactly. */
export function subMoney(a: unknown, b: unknown): number {
  return fromPaisa(toPaisa(a) - toPaisa(b));
}

/** Compares two amounts to the paisa: −1, 0 or 1. */
export function compareMoney(a: unknown, b: unknown): -1 | 0 | 1 {
  const d = toPaisa(a) - toPaisa(b);
  return d < 0 ? -1 : d > 0 ? 1 : 0;
}

/** True when the amount is at least one paisa above zero. */
export function isPositive(value: unknown): boolean {
  return toPaisa(value) > 0;
}

/**
 * Splits an amount into `parts` monthly installments: each is the amount ÷ parts rounded DOWN to the paisa, and the
 * last one absorbs the remainder, so they always add back to exactly the amount (৳1,000 / 3 → 333.33, 333.33, 333.34).
 * This is the rule the EMI schedule has always used; only the arithmetic is now exact.
 */
export function splitInstallments(amount: unknown, parts: number): number[] {
  const total = toPaisa(amount);
  if (!Number.isInteger(parts) || parts < 1 || Number.isNaN(total)) return [];
  const per = Math.floor(total / parts);
  return Array.from({ length: parts }, (_, i) => fromPaisa(i === parts - 1 ? total - per * (parts - 1) : per));
}

/** The regular (non-final) installment of splitInstallments. */
export function installmentAmount(amount: unknown, parts: number): number {
  const total = toPaisa(amount);
  if (!Number.isInteger(parts) || parts < 1 || Number.isNaN(total)) return 0;
  return fromPaisa(Math.floor(total / parts));
}
