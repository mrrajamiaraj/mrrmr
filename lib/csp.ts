// Content-Security-Policy, built per request in proxy.ts with a fresh nonce. Pure, so tests/csp.test.mjs runs it.
//
// Scripts: only ones carrying this request's nonce ('strict-dynamic' then lets those load their own chunks, e.g. the
// Turnstile loader inserting Cloudflare's script). No 'unsafe-inline' scripts any more (finding S9). Styles keep
// 'unsafe-inline' (React style attributes and next/font); every other directive is the same as before.

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // 'self' and the Turnstile origin are ignored by CSP3 browsers when 'strict-dynamic' is present; they are the
    // fallback for older ones. 'unsafe-eval' only in development (React's dev error overlay).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${TURNSTILE_ORIGIN}${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** 128 random bits, base64. */
export function makeNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b));
}
