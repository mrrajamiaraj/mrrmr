// Admin MFA rules (lib/mfa-core.ts), the proxy gate wiring, writer()'s aal2 re-check and migration 0014's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mfaGate, mfaExempt, hasVerifiedFactor, freshAal2, cleanTotp } from "../lib/mfa-core.ts";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

test("only a VERIFIED factor counts", () => {
  assert.equal(hasVerifiedFactor([{ status: "unverified" }]), false);
  assert.equal(hasVerifiedFactor([{ status: "unverified" }, { status: "verified" }]), true);
  assert.equal(hasVerifiedFactor(undefined), false);
  assert.equal(hasVerifiedFactor([]), false);
});

test("an aal1 admin with a factor may open only /auth/* and /view", () => {
  for (const p of ["/", "/account", "/debtors/x", "/export", "/export/pdf?all=1", "/research", "/settings", "/login", "/authx", "/AUTHX/mfa"])
    assert.equal(mfaGate({ aal: "aal1", hasFactor: true, path: p }), "require-mfa", p);
  for (const p of ["/auth/mfa", "/auth/mfa?next=/cards/1", "/auth/reset", "/auth/callback", "/view", "/AUTH/MFA"])
    assert.equal(mfaGate({ aal: "aal1", hasFactor: true, path: p }), "allow", p);
  assert.equal(mfaExempt("/auth/../account"), false, "dot segments are resolved first");
});

test("aal2, or no factor at all, is allowed everywhere", () => {
  assert.equal(mfaGate({ aal: "aal2", hasFactor: true, path: "/account" }), "allow");
  assert.equal(mfaGate({ aal: "aal1", hasFactor: false, path: "/account" }), "allow");
  assert.equal(mfaGate({ aal: undefined, hasFactor: true, path: "/account" }), "require-mfa", "missing aal is not aal2");
});

test("removing a factor needs a TOTP step in the last 10 minutes", () => {
  const now = 3_000_000;
  assert.equal(freshAal2("aal2", [{ method: "password", timestamp: now - 30 }, { method: "totp", timestamp: now - 60 }], now), true);
  assert.equal(freshAal2("aal2", [{ method: "totp", timestamp: now - 900 }], now), false, "stale");
  assert.equal(freshAal2("aal1", [{ method: "totp", timestamp: now - 60 }], now), false);
  assert.equal(freshAal2("aal2", ["password", "totp"], now, 600, now - 60), true, "string amr dated by iat");
  assert.equal(freshAal2("aal2", ["totp"], now), false, "string amr without iat is not trusted");
});

test("TOTP codes: exactly 6 digits", () => {
  assert.equal(cleanTotp("123 456"), "123456");
  for (const no of ["12345", "1234567", "abcdef", "", null, 123456]) assert.equal(cleanTotp(no), null, String(no));
});

test("proxy gates admins at aal1 with a factor, using getUser (not the cookie's factor list)", () => {
  const src = read("../proxy.ts");
  assert.match(src, /signedIn && !viewer && data\?\.claims\?\.aal !== "aal2" && !mfaExempt\(path\)/);
  assert.match(src, /url\.pathname = "\/auth\/mfa"|go\("\/auth\/mfa"/);
  assert.match(src, /supabase\.auth\.getUser\(\)/);
  assert.ok(!/getSession\(|getAuthenticatorAssuranceLevel\(\)/.test(src), "no cookie-only factor checks");
});

test("writer() refuses an aal1 admin with a verified factor (re-checked server-side for every write)", () => {
  const src = read("../lib/viewer.ts");
  assert.match(src, /claims\.aal !== "aal2"/);
  assert.match(src, /hasVerifiedFactor\(u\.user\.factors\)\) throw new Error\(MFA_REQUIRED\)/);
  for (const f of ["../lib/actions.ts", "../lib/research-actions.ts"]) {
    const s = read(f);
    const exported = (s.match(/^export async function /gm) ?? []).length;
    const guarded = (s.match(/await writer\(\)/g) ?? []).length;
    assert.ok(guarded >= exported, `${f}: every exported action calls writer() (${guarded}/${exported})`);
  }
});

test("MFA step is rate limited and Turnstile-checked before the code is verified", () => {
  const src = read("../lib/mfa-actions.ts");
  const body = src.slice(src.indexOf("export async function verifyMfa"), src.indexOf("export async function startTotpEnroll"));
  const lim = body.indexOf("codeLimit("), ts = body.indexOf("verifyTurnstile("), ver = body.indexOf("challengeAndVerify(");
  assert.ok(lim > 0 && ts > lim && ver > ts);
  assert.match(src, /\["mfa", hashKey\(`user:\$\{userId\}`\)\], \["mfa", ipKey\(ip\)\]/);
});

test("0014: a restrictive aal2 policy on every data table, viewer reads kept, viewers table untouched, has DOWN", () => {
  const sql = read("../supabase/migrations/0014_require_aal2.sql");
  for (const t of ["accounts", "cards", "people", "loans", "card_uses", "repayments", "research_expenses", "research_contributions", "audit_log", "balance_adjustments"])
    assert.ok(sql.includes(`'${t}'`), t);
  assert.match(sql, /as restrictive for all to authenticated/);
  assert.match(sql, /->> ''aal''\) = ''aal2''/);
  assert.match(sql, /viewed_owner\(\)\) is not null/);
  assert.ok(!/'viewers'/.test(sql), "viewers table not restricted");
  assert.ok(!/^\s*(grant|revoke|alter table|drop table)/im.test(sql), "no grant/table changes");
  assert.match(sql, /DOWN/);
  const rls = read("../supabase/tests/rls_viewer.sql");
  assert.match(rls, /'aal', 'aal1'/);
  assert.match(rls, /aal1_owner_probe/);
});
