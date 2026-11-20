// Turnstile server check (lib/turnstile-core.ts) with fetch mocked: nothing here talks to Cloudflare.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyTurnstileToken, turnstileHosts, SITEVERIFY_URL, MAX_TOKEN_LENGTH } from "../lib/turnstile-core.ts";

const SECRET = "0x4AAAAAAAfake-secret-for-tests";
const reply = (body, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const opts = (fetchImpl, extra = {}) => ({ secret: SECRET, allowedHosts: ["mrrmr.example"], production: true, fetchImpl, ...extra });
const good = { success: true, action: "login", hostname: "mrrmr.example", "error-codes": [] };

test("accepts a successful token for the right action and host, posting form-encoded secret/response/remoteip", async () => {
  let seen;
  const f = async (url, init) => { seen = { url, init }; return reply(good)(); };
  const r = await verifyTurnstileToken("tok", "203.0.113.9", "login", opts(f));
  assert.deepEqual(r, { ok: true });
  assert.equal(seen.url, SITEVERIFY_URL);
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  const body = new URLSearchParams(seen.init.body.toString());
  assert.equal(body.get("secret"), SECRET);
  assert.equal(body.get("response"), "tok");
  assert.equal(body.get("remoteip"), "203.0.113.9");
});

test("rejects a token solved for a different action", async () => {
  const r = await verifyTurnstileToken("tok", null, "view", opts(reply(good)));
  assert.deepEqual(r, { ok: false, reason: "wrong-action" });
});

test("rejects a token solved on a different hostname", async () => {
  const r = await verifyTurnstileToken("tok", null, "login", opts(reply({ ...good, hostname: "evil.example" })));
  assert.deepEqual(r, { ok: false, reason: "wrong-hostname" });
  const r2 = await verifyTurnstileToken("tok", null, "login", opts(reply({ ...good, hostname: undefined })));
  assert.equal(r2.ok, false);
});

test("rejects success:false and passes only Cloudflare's error codes to the log", async () => {
  const logged = [];
  const r = await verifyTurnstileToken("secret-token-value", "198.51.100.7", "login",
    opts(reply({ success: false, "error-codes": ["invalid-input-response"] }), { log: (reason, codes) => logged.push({ reason, codes }) }));
  assert.deepEqual(r, { ok: false, reason: "not-successful" });
  assert.deepEqual(logged, [{ reason: "not-successful", codes: ["invalid-input-response"] }]);
  assert.ok(!JSON.stringify(logged).includes("secret-token-value") && !JSON.stringify(logged).includes("198.51.100.7"));
});

test("a timeout rejects (fails closed)", async () => {
  const hang = (_u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted"))));
  const r = await verifyTurnstileToken("tok", null, "login", opts(hang, { timeoutMs: 20 }));
  assert.deepEqual(r, { ok: false, reason: "timeout" });
});

test("network errors, non-200 and bad JSON reject", async () => {
  assert.deepEqual(await verifyTurnstileToken("tok", null, "login", opts(async () => { throw new Error("down"); })), { ok: false, reason: "network-error" });
  assert.deepEqual(await verifyTurnstileToken("tok", null, "login", opts(reply(good, 500))), { ok: false, reason: "http-500" });
  const notJson = async () => new Response("<html>", { status: 200 });
  assert.equal((await verifyTurnstileToken("tok", null, "login", opts(notJson))).ok, false);
});

test("a missing secret rejects without calling Cloudflare", async () => {
  let called = false;
  const f = async () => { called = true; return reply(good)(); };
  assert.deepEqual(await verifyTurnstileToken("tok", null, "login", opts(f, { secret: undefined })), { ok: false, reason: "missing-secret" });
  assert.deepEqual(await verifyTurnstileToken("tok", null, "login", opts(f, { secret: "" })), { ok: false, reason: "missing-secret" });
  assert.equal(called, false);
});

test("a missing or oversized token rejects without calling Cloudflare", async () => {
  let called = false;
  const f = async () => { called = true; return reply(good)(); };
  assert.deepEqual(await verifyTurnstileToken("x".repeat(MAX_TOKEN_LENGTH + 1), null, "login", opts(f)), { ok: false, reason: "oversized-token" });
  for (const t of ["", null, undefined, 42, {}]) assert.equal((await verifyTurnstileToken(t, null, "login", opts(f))).ok, false);
  assert.equal(called, false);
});

test("Cloudflare test secrets work only outside production", async () => {
  const testReply = reply({ success: true, hostname: "example.com", "error-codes": [] });
  const t = "1x0000000000000000000000000000000AA";
  assert.equal((await verifyTurnstileToken("XXXX.DUMMY.TOKEN.XXXX", null, "login", opts(testReply, { secret: t, production: false }))).ok, true);
  assert.deepEqual(await verifyTurnstileToken("XXXX.DUMMY.TOKEN.XXXX", null, "login", opts(testReply, { secret: t, production: true })), { ok: false, reason: "test-secret-in-production" });
});

test("allowed hosts: SITE_URL's host; localhost only outside production; nothing in production without SITE_URL", () => {
  assert.deepEqual(turnstileHosts("https://MRRMR.example/x", true), ["mrrmr.example"]);
  assert.deepEqual(turnstileHosts("https://mrrmr.example", false), ["mrrmr.example", "localhost", "127.0.0.1"]);
  assert.deepEqual(turnstileHosts(undefined, true), []);
  assert.deepEqual(turnstileHosts("not a url", true), []);
});

test("every unauthenticated action checks Turnstile after the rate limit and before Supabase", () => {
  for (const [file, fns] of [["../app/login/actions.ts", ["signIn", "forgotPassword"]], ["../app/view/actions.ts", ["enterViewMode"]], ["../app/auth/reset/actions.ts", ["resetPassword"]]]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const fn of fns) {
      const body = src.slice(src.indexOf(`export async function ${fn}(`)).split(/\nexport /)[0];
      const limit = body.search(/hitAll\(/), check = body.indexOf("verifyTurnstile("), supa = body.indexOf("createClient(");
      assert.ok(limit > 0 && check > limit && supa > check, `${fn}: rate limit → Turnstile → Supabase`);
    }
  }
});

test("CSP allows Turnstile's script and frame origin and nothing new elsewhere", () => {
  const cfg = readFileSync(new URL("../lib/csp.ts", import.meta.url), "utf8");
  assert.match(cfg, /script-src[^\n]*\$\{TURNSTILE_ORIGIN\}/);
  assert.match(cfg, /`frame-src \$\{TURNSTILE_ORIGIN\}`/);
  assert.match(cfg, /TURNSTILE_ORIGIN = "https:\/\/challenges\.cloudflare\.com"/);
  assert.match(cfg, /connect-src 'self'\$\{isDev/);
});
