// Security helpers with no framework imports, so tests/security.test.mjs can run them directly under Node.
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Where to send someone after signing in. Only a path on this site: never "//evil.com", "/\evil.com"
 * (browsers read a backslash as a slash) or anything with control characters or a scheme.
 */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    // Resolve against a dummy origin: anything that escapes it (e.g. "/%2F%2Fevil.com" decoded by a proxy) fails.
    const u = new URL(value, "https://x.invalid");
    if (u.origin !== "https://x.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

/** Paths anyone can open without signing in. */
export const PUBLIC_PATHS = ["/login", "/auth", "/view"];
/** The ONLY signed-in paths view mode may open: Research Finance and its own export. Everything else redirects. */
export const VIEWER_PATHS = ["/research"];

const under = (path: string, roots: string[]) => roots.some((p) => path === p || path.startsWith(p + "/"));
export const isPublicPath = (path: string) => under(path, PUBLIC_PATHS);
/**
 * Whether a view-mode session may open `path`. Allow-list, not block-list: a page added later is private by default.
 * Normalises case and repeated or trailing slashes first, so "/RESEARCH/../account" tricks can't slip through.
 */
export function viewerMayOpen(path: string): boolean {
  let p: string;
  try { p = new URL(path, "https://x.invalid").pathname.toLowerCase().replace(/\/{2,}/g, "/"); } catch { return false; }
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return isPublicPath(p) || under(p, VIEWER_PATHS);
}

/** Compares two secrets in constant time, so response timing reveals nothing about how much of a guess was right. */
export function secretEquals(given: string, expected: string): boolean {
  // Hashing first makes both sides the same length, which timingSafeEqual requires, without leaking the length.
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * Fixed-window attempt counter, in memory. On serverless hosting each instance keeps its own count, so this slows
 * guessing down a lot but is not a hard global limit; Supabase's own auth rate limits still apply behind it.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Counts one attempt for `key`. Returns how long to wait (ms) if it is over the limit, else 0. */
  hit(key: string, now = Date.now()): number {
    if (this.hits.size > 5000) this.sweep(now);
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return 0;
    }
    h.count++;
    return h.count > this.limit ? h.resetAt - now : 0;
  }

  /** Forget a key, e.g. after a successful sign-in. */
  clear(key: string) {
    this.hits.delete(key);
  }

  private sweep(now: number) {
    for (const [k, h] of this.hits) if (h.resetAt <= now) this.hits.delete(k);
  }
}

/** "Try again in 7 minutes." */
export function waitText(ms: number) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  return `Too many attempts. Try again in ${min} minute${min === 1 ? "" : "s"}.`;
}

/**
 * The caller's IP as the first x-forwarded-for hop, or "unknown".
 * @deprecated A client can send its own x-forwarded-for; use trustedClientIp() / requestIp() (lib/rate-limit*).
 */
export function clientIp(get: (name: string) => string | null): string {
  const fwd = get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || get("x-real-ip")?.trim() || "unknown";
}

type Amr = ({ method?: string; timestamp?: number } | string)[] | undefined;

/**
 * Setting a password without the current one is only for someone who just arrived from a reset email.
 * Supabase records how the session was created in the JWT's `amr` claim (a reset link gives "otp"); a session that
 * only ever used a password must go through "change password" (which asks for the current one) instead.
 * `amr` comes either as objects with timestamps or as plain strings; for strings the token's `iat` dates it.
 */
export function isRecoverySession(amr: Amr, nowSec = Date.now() / 1000, maxAgeSec = 3600, issuedAt?: number): boolean {
  if (!Array.isArray(amr) || amr.length === 0) return false;
  return amr.some((a) => {
    const method = typeof a === "string" ? a : a?.method;
    const at = typeof a === "string" ? issuedAt : a?.timestamp;
    return !!method && method !== "password" && typeof at === "number" && nowSec - at <= maxAgeSec;
  });
}

/**
 * One CSV cell. Quotes when needed, and defuses spreadsheet formulas: text starting with = + - @ (or a tab/CR)
 * gets a leading apostrophe so Excel/Sheets show it as text instead of running it. Numbers are left alone.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Trims and caps free text from forms, so one request can't store megabytes in a name or note. */
export function cleanText(s: unknown, max: number): string {
  return (typeof s === "string" ? s : "").trim().slice(0, max);
}

/**
 * The site's own origin for links in emails: SITE_URL if set, otherwise the request's Origin only when it matches
 * the Host it was sent to. Never trusts a bare Origin header.
 */
export function siteOrigin(get: (name: string) => string | null, configured = process.env.SITE_URL): string | null {
  if (configured) {
    try { return new URL(configured).origin; } catch { /* fall through to the request */ }
  }
  const origin = get("origin");
  const host = get("x-forwarded-host") ?? get("host");
  if (!origin || !host) return null;
  try {
    const u = new URL(origin);
    return u.host === host ? u.origin : null;
  } catch {
    return null;
  }
}
