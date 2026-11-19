// Security regression tests. Run with `npm test` (Node's built-in runner; Node 23.6+ runs the .ts imports directly).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeNextPath, secretEquals, RateLimiter, waitText, clientIp, isRecoverySession, csvCell, cleanText, siteOrigin,
} from "../lib/security.ts";

import { hardenCookie } from "../lib/supabase/cookies.ts";

const headers = (h) => (name) => h[name.toLowerCase()] ?? null;

test("session cookies are httpOnly + SameSite=Lax, and keep Supabase's own expiry", () => {
  const c = hardenCookie({ maxAge: 400 * 86400, httpOnly: false, sameSite: "none" });
  assert.equal(c.httpOnly, true, "page scripts cannot read the session token");
  assert.equal(c.sameSite, "lax");
  assert.equal(c.path, "/");
  assert.equal(c.maxAge, 400 * 86400);
  assert.equal(hardenCookie({ maxAge: 0 }).maxAge, 0, "sign-out still clears the cookie");
});

test("safeNextPath keeps same-site paths", () => {
  assert.equal(safeNextPath("/account"), "/account");
  assert.equal(safeNextPath("/cards/2?x=1#top"), "/cards/2?x=1#top");
  assert.equal(safeNextPath("/"), "/");
});

test("safeNextPath blocks open redirects", () => {
  for (const evil of [
    "//evil.com", "/\\evil.com", "/\\/evil.com", "\\\\evil.com", "https://evil.com", "http:/evil.com",
    "javascript:alert(1)", "/\tevil.com", "/\n/evil.com", "evil.com", "", null, undefined, 42, "/" + "a".repeat(600),
  ]) {
    assert.equal(safeNextPath(evil), "/", `should reject ${JSON.stringify(evil)}`);
  }
});

test("secretEquals matches only the exact secret", () => {
  assert.equal(secretEquals("mrrmr", "mrrmr"), true);
  assert.equal(secretEquals("mrrm", "mrrmr"), false);
  assert.equal(secretEquals("MRRMR", "mrrmr"), false);
  assert.equal(secretEquals("", "mrrmr"), false);
});

test("RateLimiter allows the limit, then blocks until the window ends", () => {
  const rl = new RateLimiter(3, 60_000);
  const t0 = 1_000_000;
  assert.equal(rl.hit("ip", t0), 0);
  assert.equal(rl.hit("ip", t0 + 1), 0);
  assert.equal(rl.hit("ip", t0 + 2), 0);
  assert.ok(rl.hit("ip", t0 + 3) > 0, "4th attempt is blocked");
  assert.equal(rl.hit("other-ip", t0 + 3), 0, "other callers are unaffected");
  assert.equal(rl.hit("ip", t0 + 60_001), 0, "a new window starts fresh");
  rl.hit("ip", t0 + 60_002); rl.hit("ip", t0 + 60_003);
  rl.clear("ip");
  assert.equal(rl.hit("ip", t0 + 60_004), 0, "clear() resets the key");
});

test("waitText rounds up to whole minutes", () => {
  assert.equal(waitText(1), "Too many attempts. Try again in 1 minute.");
  assert.equal(waitText(61_000), "Too many attempts. Try again in 2 minutes.");
});

test("clientIp takes the first forwarded hop", () => {
  assert.equal(clientIp(headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
  assert.equal(clientIp(headers({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
  assert.equal(clientIp(headers({})), "unknown");
});

test("isRecoverySession: only fresh non-password sessions may set a password without the old one", () => {
  const now = 2_000_000;
  assert.equal(isRecoverySession([{ method: "otp", timestamp: now - 60 }], now), true);
  assert.equal(isRecoverySession([{ method: "recovery", timestamp: now - 60 }], now), true);
  assert.equal(isRecoverySession([{ method: "password", timestamp: now - 60 }], now), false, "plain password session");
  assert.equal(isRecoverySession([{ method: "otp", timestamp: now - 7200 }], now), false, "stale reset session");
  assert.equal(isRecoverySession(["otp"], now, 3600, now - 60), true, "string-format amr dated by iat");
  assert.equal(isRecoverySession(["password"], now, 3600, now - 60), false);
  assert.equal(isRecoverySession(["otp"], now, 3600, now - 7200), false, "string-format, stale");
  assert.equal(isRecoverySession(["otp"], now), false, "string-format with no iat is not trusted");
  assert.equal(isRecoverySession(undefined, now), false);
  assert.equal(isRecoverySession([], now), false);
});

test("csvCell quotes and defuses formulas, leaves numbers alone", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell("+8801711000000"), "'+8801711000000");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("-5"), "'-5");
  assert.equal(csvCell(-5), "-5", "numbers are not text formulas");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell("Rahim"), "Rahim");
});

test("cleanText trims and caps", () => {
  assert.equal(cleanText("  hi  ", 10), "hi");
  assert.equal(cleanText("x".repeat(50), 10).length, 10);
  assert.equal(cleanText(undefined, 10), "");
});

test("siteOrigin trusts SITE_URL, else only an Origin that matches the Host", () => {
  assert.equal(siteOrigin(headers({ origin: "https://evil.com", host: "app.example.com" }), "https://app.example.com/x"), "https://app.example.com");
  assert.equal(siteOrigin(headers({ origin: "https://app.example.com", host: "app.example.com" }), ""), "https://app.example.com");
  assert.equal(siteOrigin(headers({ origin: "https://evil.com", host: "app.example.com" }), ""), null);
  assert.equal(siteOrigin(headers({ host: "app.example.com" }), ""), null);
});

import { viewerMayOpen, isPublicPath } from "../lib/security.ts";

test("view mode may open ONLY Research (and public pages) — every private route is refused", () => {
  for (const ok of ["/research", "/research/", "/research/export", "/RESEARCH", "/login", "/view", "/auth/reset"]) {
    assert.equal(viewerMayOpen(ok), true, ok);
  }
  for (const no of ["/", "/account", "/debtors", "/debtors/abc", "/cards/1", "/cards/2", "/export", "/export?type=full",
    "/repayments", "/reports", "/settings", "/reconcile", "/audit", "/researchers", "/research/../account",
    "/research/%2e%2e/account", "//research/../export", "/account#research"]) {
    assert.equal(viewerMayOpen(no), false, no);
  }
});

test("public paths are exact roots, not prefixes", () => {
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/loginx"), false);
  assert.equal(isPublicPath("/viewer-secrets"), false);
});

import { viewModeConfig } from "../lib/view-config.ts";
import { isIsoDate, optionalDate, amountInRange, isUuid, MAX_AMOUNT } from "../lib/validate.ts";
import { readFileSync } from "node:fs";

test("view mode (no key) fails closed: off unless a strong viewer-account password is configured", () => {
  assert.equal(viewModeConfig({}), null, "nothing configured → off");
  assert.equal(viewModeConfig({ VIEWER_PASSWORD: "short" }), null, "weak viewer password → off");
  assert.deepEqual(viewModeConfig({ VIEWER_PASSWORD: "p".repeat(24) }), { email: "viewer@mrrmr.app", password: "p".repeat(24) });
  assert.equal(viewModeConfig({ VIEWER_PASSWORD: "p".repeat(24), VIEWER_EMAIL: "v@x.test" }).email, "v@x.test");
});

test("no viewer secret is written in the source any more", () => {
  for (const f of ["../lib/viewer.ts", "../lib/view-config.ts", "../app/view/actions.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(!/\|\|\s*"mrrmr"/.test(src), `${f}: passcode default`);
    assert.ok(!/VIEWER_PASSWORD\s*\|\|\s*"/.test(src), `${f}: password default`);
  }
});

test("dates must be real calendar dates in range; amounts within the column's range", () => {
  for (const ok of ["2026-11-19", "2024-02-29", "1990-01-01", "2100-12-31"]) assert.equal(isIsoDate(ok), true, ok);
  for (const no of ["2026-02-29", "2026-13-01", "2026-11-31", "19-11-2026", "2026-11-19T00:00", "1989-12-31", "2101-01-01", "", null, 20261119]) assert.equal(isIsoDate(no), false, String(no));
  assert.deepEqual(optionalDate(""), { ok: true, value: null });
  assert.deepEqual(optionalDate("2026-02-30"), { ok: false });
  assert.equal(amountInRange(0.01), true);
  assert.equal(amountInRange(MAX_AMOUNT), true);
  for (const no of [0, -1, MAX_AMOUNT + 1, Infinity, NaN]) assert.equal(amountInRange(no), false, String(no));
  assert.equal(isUuid("9056aabe-a678-4339-90ad-304210f19cfd"), true);
  assert.equal(isUuid("'; drop table loans; --"), false);
});
