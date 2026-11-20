import "server-only";
import { turnstileHosts, verifyTurnstileToken, type TurnstileAction } from "@/lib/turnstile-core";

export { TURNSTILE_FAILED, type TurnstileAction } from "@/lib/turnstile-core";

/** The form field the widget fills (Cloudflare's conventional name). */
export const TURNSTILE_FIELD = "cf-turnstile-response";

/** The public site key, read on the server and passed to the widget as a prop (no NEXT_PUBLIC_ variable). */
export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY || null;
}

/**
 * True only when Cloudflare confirms the token for this action on our host. Fails closed without
 * TURNSTILE_SECRET_KEY (and, in production, without SITE_URL). Logs Cloudflare's error codes only.
 */
export async function verifyTurnstile(token: unknown, ip: string | null, expectedAction: TurnstileAction): Promise<boolean> {
  const production = process.env.NODE_ENV === "production";
  const r = await verifyTurnstileToken(token, ip, expectedAction, {
    secret: process.env.TURNSTILE_SECRET_KEY,
    allowedHosts: turnstileHosts(process.env.SITE_URL, production),
    production,
    log: (reason, codes) => console.warn(JSON.stringify({ event: "turnstile_reject", action: expectedAction, reason, codes })),
  });
  return r.ok;
}
