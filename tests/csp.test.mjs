// Phase 4: per-request nonce CSP (lib/csp.ts, proxy.ts) and the extra headers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCsp, makeNonce } from "../lib/csp.ts";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const directives = (csp) => Object.fromEntries(csp.split("; ").map((d) => { const [k, ...v] = d.split(" "); return [k, v]; }));

test("production script-src: self + this nonce + strict-dynamic + Turnstile; no unsafe-inline/eval", () => {
  const d = directives(buildCsp("bm9uY2U=", false));
  assert.deepEqual(d["script-src"], ["'self'", "'nonce-bm9uY2U='", "'strict-dynamic'", "https://challenges.cloudflare.com"]);
  assert.ok(!d["script-src"].includes("'unsafe-inline'") && !d["script-src"].includes("'unsafe-eval'"));
});

test("every other directive is kept from the old policy", () => {
  const d = directives(buildCsp("n", false));
  assert.deepEqual(d["default-src"], ["'self'"]);
  assert.deepEqual(d["style-src"], ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(d["img-src"], ["'self'", "data:", "blob:"]);
  assert.deepEqual(d["font-src"], ["'self'", "data:"]);
  assert.deepEqual(d["connect-src"], ["'self'"]);
  assert.deepEqual(d["frame-src"], ["https://challenges.cloudflare.com"]);
  assert.deepEqual(d["object-src"], ["'none'"]);
  assert.deepEqual(d["base-uri"], ["'self'"]);
  assert.deepEqual(d["form-action"], ["'self'"]);
  assert.deepEqual(d["frame-ancestors"], ["'none'"]);
  assert.deepEqual(d["manifest-src"], ["'self'"]);
  assert.ok("upgrade-insecure-requests" in d);
});

test("development adds only unsafe-eval and websocket connect", () => {
  const d = directives(buildCsp("n", true));
  assert.ok(d["script-src"].includes("'unsafe-eval'"));
  assert.deepEqual(d["connect-src"], ["'self'", "ws:", "wss:"]);
  assert.ok(!("upgrade-insecure-requests" in d));
});

test("nonces are 128-bit, base64 and unique", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const n = makeNonce();
    assert.match(n, /^[A-Za-z0-9+/]{22}==$/);
    seen.add(n);
  }
  assert.equal(seen.size, 200);
});

test("proxy sets the CSP on the request (for Next) and on every response, and passes x-nonce", () => {
  const src = read("../proxy.ts");
  assert.match(src, /h\.set\("x-nonce", nonce\)/);
  assert.match(src, /h\.set\("Content-Security-Policy", csp\)/);
  assert.match(src, /res\.headers\.set\("Content-Security-Policy", csp\)/);
  assert.ok(!/return NextResponse\.(redirect|next)\(/.test(src), "every response goes through finish()");
});

test("theme script and Turnstile loader carry the nonce; next.config no longer sets a page CSP", () => {
  assert.match(read("../app/layout.tsx"), /<script nonce=\{nonce\} dangerouslySetInnerHTML/);
  assert.match(read("../components/turnstile.tsx"), /if \(nonce\) s\.nonce = nonce/);
  const cfg = read("../next.config.ts");
  assert.ok(!/unsafe-inline'\$\{isDev|script-src/.test(cfg), "no script-src left in next.config");
  assert.match(cfg, /"Cross-Origin-Resource-Policy", value: "same-origin"/);
  assert.match(cfg, /"X-Permitted-Cross-Domain-Policies", value: "none"/);
  assert.ok(!/preload/.test(cfg.replace(/Not "preload"/, "")), "HSTS preload not added");
});
