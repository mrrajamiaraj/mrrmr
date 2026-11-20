// Security event lines. Pure, so tests/security-log.test.mjs checks that nothing private can be logged.
import { createHmac } from "node:crypto";

export const SECURITY_EVENTS = [
  "signin_success", "signin_fail", "mfa_success", "mfa_fail", "mfa_enrolled", "mfa_removed",
  "turnstile_fail", "rate_limit_hit", "view_entry", "view_fail",
] as const;
export type SecurityEvent = (typeof SECURITY_EVENTS)[number];

/** Only these extra fields may be logged; anything else (emails, tokens, amounts, names) is dropped. */
const ALLOWED = new Set(["action", "limiter", "reason", "status"]);
const SAFE_VALUE = /^[a-z0-9_.:-]{1,40}$/i;

/** Keyed hash of the IP: lets you count failures per source without storing the address. */
export function hashIp(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("hex").slice(0, 16);
}

/** One JSON line: {"type":"security","event":…,"time":…,"ip":<hash>,…allowed short fields}. */
export function formatSecurityEvent(
  event: SecurityEvent,
  fields: Record<string, unknown> & { ip?: string },
  now: Date,
  salt: string,
): string {
  const out: Record<string, string> = { type: "security", event, time: now.toISOString() };
  if (typeof fields.ip === "string" && fields.ip) out.ip = hashIp(fields.ip, salt);
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED.has(k)) continue;
    const s = typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
    if (SAFE_VALUE.test(s)) out[k] = s;
  }
  return JSON.stringify(out);
}
