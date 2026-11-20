// Cloudflare Turnstile server-side check. Pure (no framework imports, fetch is injectable), so
// tests/turnstile.test.mjs can run it under Node. lib/turnstile.ts is the server-only entry point the actions use.

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Cloudflare's documented token maximum. */
export const MAX_TOKEN_LENGTH = 2048;
export const VERIFY_TIMEOUT_MS = 5000;

export type TurnstileAction = "login" | "reset" | "view" | "mfa";

/**
 * Cloudflare's published test secrets (always pass / always fail / duplicate). They answer with hostname
 * "example.com" and no action, so outside production the action/hostname checks are skipped for them; in
 * production a test secret is a misconfiguration and every check fails.
 */
const TEST_SECRETS = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export type VerifyOptions = {
  secret: string | undefined;
  /** Hosts a token may have been solved on (SITE_URL's host, plus localhost outside production). */
  allowedHosts: string[];
  production: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Where failures are reported. Only Cloudflare's error codes are passed, never the token, IP or email. */
  log?: (reason: string, codes: string[]) => void;
};

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/** Hosts a token may come from, worked out from SITE_URL. Empty in production without SITE_URL: fails closed. */
export function turnstileHosts(siteUrl: string | undefined, production: boolean): string[] {
  const hosts: string[] = [];
  if (siteUrl) {
    try { hosts.push(new URL(siteUrl).hostname.toLowerCase()); } catch { /* unusable SITE_URL: no host */ }
  }
  if (!production) hosts.push("localhost", "127.0.0.1");
  return hosts;
}

/**
 * Accepts the token only if Cloudflare says success === true AND it was solved for `expectedAction` on one of our
 * hosts. Everything else — no secret, no/oversized token, network error, timeout, non-200, bad JSON — is a rejection.
 */
export async function verifyTurnstileToken(
  token: unknown,
  ip: string | null,
  expectedAction: TurnstileAction,
  opts: VerifyOptions,
): Promise<VerifyResult> {
  const fail = (reason: string, codes: string[] = []): VerifyResult => {
    opts.log?.(reason, codes);
    return { ok: false, reason };
  };
  const secret = opts.secret ?? "";
  if (!secret) return fail("missing-secret");
  const isTest = TEST_SECRETS.has(secret);
  if (isTest && opts.production) return fail("test-secret-in-production");
  if (typeof token !== "string" || token.length === 0) return fail("missing-token");
  if (token.length > MAX_TOKEN_LENGTH) return fail("oversized-token");

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown" && ip !== "local") body.set("remoteip", ip);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? VERIFY_TIMEOUT_MS);
  let data: { success?: unknown; action?: unknown; hostname?: unknown; "error-codes"?: unknown };
  try {
    const res = await (opts.fetchImpl ?? fetch)(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status !== 200) return fail(`http-${res.status}`);
    data = await res.json();
  } catch (e) {
    return fail(ctrl.signal.aborted ? "timeout" : "network-error");
  } finally {
    clearTimeout(timer);
  }

  const codes = Array.isArray(data?.["error-codes"]) ? data["error-codes"].filter((c): c is string => typeof c === "string").slice(0, 5) : [];
  if (data?.success !== true) return fail("not-successful", codes);
  if (isTest) return { ok: true }; // dev/test only (production was refused above)
  if (data.action !== expectedAction) return fail("wrong-action", codes);
  const host = typeof data.hostname === "string" ? data.hostname.toLowerCase() : "";
  if (!host || !opts.allowedHosts.includes(host)) return fail("wrong-hostname", codes);
  return { ok: true };
}

/** The one message every failed check shows (no detail about why, by design). */
export const TURNSTILE_FAILED = "Verification failed. Please try again.";
