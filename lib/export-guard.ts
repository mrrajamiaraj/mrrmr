import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isViewerEmail, writer } from "@/lib/viewer";
import { hashKey } from "@/lib/rate-limit-core";
import { limiter, requestIp } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-log";

const plain = (text: string, status: number, extra: Record<string, string> = {}) =>
  new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", ...extra } });

/**
 * Server-side access check for every export route (the proxy checks too, but a route must not rely on it):
 *   "admin"    — finance exports: signed in, not view mode, and aal2 when an authenticator is set up (via writer()).
 *   "research" — research exports: the admin (same checks) or a view-mode session.
 * Then 30 exports per 10 minutes per user (view mode shares one account, so it's keyed per user AND IP).
 * Returns a Response to send back when refused, or null to carry on.
 */
export async function exportGuard(kind: "admin" | "research"): Promise<Response | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return plain("Sign in first.", 401);
  const viewer = isViewerEmail(claims.email as string | undefined);
  if (kind === "admin" && viewer) return plain("This export is available to the admin only.", 403);
  if (!viewer) {
    try { await writer(); } catch (e) { return plain((e as Error).message, 403); }
  }
  const ip = await requestIp();
  const key = hashKey(viewer ? `user:${claims.sub}:ip:${ip}` : `user:${claims.sub}`);
  const wait = await limiter("exportUser").hit(key);
  if (wait) {
    logSecurityEvent("rate_limit_hit", { limiter: "exportUser", ip });
    return plain("Too many downloads. Try again in a few minutes.", 429, { "Retry-After": String(Math.ceil(wait / 1000)) });
  }
  return null;
}

/** PDF date ranges are capped at ~10 years, so one request can't ask for an unbounded document. */
export const MAX_PDF_RANGE_DAYS = 3660;
export function pdfRangeTooLong(from: string | null, to: string | null): boolean {
  if (!from || !to) return false;
  return (Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_PDF_RANGE_DAYS;
}
/** And at most this many pages / bytes in one file. */
export const MAX_PDF_PAGES = 400;
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const pdfTooBig = (bytes: Uint8Array, pages?: number) =>
  bytes.byteLength > MAX_PDF_BYTES || (typeof pages === "number" && pages > MAX_PDF_PAGES)
    ? plain("That PDF would be too large. Pick a shorter date range.", 413)
    : null;
