// Admin MFA (TOTP) rules. Pure, so tests/mfa.test.mjs runs them under Node.

type Factor = { status?: string; factor_type?: string };
type Amr = ({ method?: string; timestamp?: number } | string)[] | undefined;

/** True when the user has at least one VERIFIED factor (an unfinished enrollment doesn't count). */
export const hasVerifiedFactor = (factors: Factor[] | null | undefined) =>
  Array.isArray(factors) && factors.some((f) => f?.status === "verified");

/**
 * Paths an admin may open while the session is still aal1 although a factor is enrolled: the MFA step itself and
 * the other /auth pages (callback, reset), plus /view (opening view mode signs the admin out). Everything else —
 * pages, exports, and server actions posted to them — waits for the code.
 */
export function mfaExempt(path: string): boolean {
  let p: string;
  try { p = new URL(path, "https://x.invalid").pathname.toLowerCase().replace(/\/{2,}/g, "/"); } catch { return false; }
  return p === "/auth" || p.startsWith("/auth/") || p === "/view";
}

/** What the proxy does for a signed-in ADMIN request (viewers never have MFA and are handled separately). */
export function mfaGate(input: { aal: unknown; hasFactor: boolean; path: string }): "allow" | "require-mfa" {
  if (input.aal === "aal2" || !input.hasFactor) return "allow";
  return mfaExempt(input.path) ? "allow" : "require-mfa";
}

/**
 * Removing a factor needs a FRESH second factor: the session is aal2 and its TOTP step happened within `maxAgeSec`.
 * `amr` entries come as objects with timestamps, or as strings dated by the token's `iat`.
 */
export function freshAal2(aal: unknown, amr: Amr, nowSec: number, maxAgeSec = 600, issuedAt?: number): boolean {
  if (aal !== "aal2" || !Array.isArray(amr)) return false;
  return amr.some((a) => {
    const method = typeof a === "string" ? a : a?.method;
    const at = typeof a === "string" ? issuedAt : a?.timestamp;
    return method === "totp" && typeof at === "number" && nowSec - at <= maxAgeSec;
  });
}

/** A 6-digit TOTP code (spaces allowed while typing), or null. */
export function cleanTotp(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const c = code.replace(/\s+/g, "");
  return /^\d{6}$/.test(c) ? c : null;
}
