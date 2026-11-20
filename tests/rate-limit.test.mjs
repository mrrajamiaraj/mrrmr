// Global rate limiter (lib/rate-limit-core.ts). Upstash is simulated in memory: no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MemoryLimiter, UpstashLimiter, upstashConfig, trustedClientIp, emailKey, hashKey, LIMITS, SLIDING_WINDOW_LUA,
} from "../lib/rate-limit-core.ts";

const headers = (h) => (name) => h[name.toLowerCase()] ?? null;

/** A fake Upstash REST endpoint that runs the sliding-window script's logic on sorted sets in memory. */
function fakeUpstash() {
  const sets = new Map();
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const args = JSON.parse(init.body);
    let result;
    if (args[0] === "EVAL") {
      assert.equal(args[1], SLIDING_WINDOW_LUA);
      const [, , , key, now, window, limit, member] = args;
      const z = (sets.get(key) ?? []).filter((e) => e.score > Number(now) - Number(window));
      if (z.length >= Number(limit)) {
        const oldest = Math.min(...z.map((e) => e.score));
        result = Math.max(1, oldest + Number(window) - Number(now));
      } else {
        z.push({ score: Number(now), member });
        result = 0;
      }
      sets.set(key, z);
    } else if (args[0] === "DEL") {
      result = sets.delete(args[1]) ? 1 : 0;
    }
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  return { f, calls, sets };
}

test("Upstash limiter: sliding window shared across 'instances', with the bearer token and hashed keys", async () => {
  const up = fakeUpstash();
  let t = 1_000_000;
  const cfg = { url: "https://example-redis.upstash.io/", token: "fake-token" };
  const mk = () => new UpstashLimiter(cfg, "loginIp", 3, 60_000, new MemoryLimiter(3, 60_000), up.f, () => t);
  const a = mk(), b = mk(); // two serverless instances share the same Redis
  const k = hashKey("ip:203.0.113.5");
  assert.equal(await a.hit(k), 0);
  assert.equal(await b.hit(k), 0);
  assert.equal(await a.hit(k), 0);
  const wait = await b.hit(k);
  assert.ok(wait > 0 && wait <= 60_000, "4th attempt across instances is blocked");
  t += 60_001;
  assert.equal(await a.hit(k), 0, "window slides");
  await b.clear(k);
  assert.equal(up.sets.size, 0, "clear() deletes the key in Redis");
  assert.equal(up.calls[0].url, "https://example-redis.upstash.io");
  assert.equal(up.calls[0].init.headers.Authorization, "Bearer fake-token");
  assert.ok(!up.calls.some((c) => c.init.body.includes("203.0.113.5")), "raw IP never sent to Redis");
});

test("Upstash errors fall back to the in-memory limiter (sign-in keeps working, still limited)", async () => {
  const down = async () => { throw new Error("unreachable"); };
  const errors = [];
  const l = new UpstashLimiter({ url: "https://x.upstash.io", token: "t" }, "viewIp", 2, 60_000, new MemoryLimiter(2, 60_000), down, Date.now, (n) => errors.push(n));
  assert.equal(await l.hit("k"), 0);
  assert.equal(await l.hit("k"), 0);
  assert.ok((await l.hit("k")) > 0);
  assert.deepEqual(errors, ["viewIp", "viewIp", "viewIp"]);
  const bad = async () => new Response(JSON.stringify({ error: "WRONGPASS" }), { status: 401 });
  const l2 = new UpstashLimiter({ url: "https://x.upstash.io", token: "t" }, "viewIp", 1, 60_000, new MemoryLimiter(1, 60_000), bad);
  assert.equal(await l2.hit("k"), 0);
  assert.ok((await l2.hit("k")) > 0, "auth error → memory fallback, still enforced");
});

test("Upstash config: needs both env vars and https; otherwise null (memory fallback)", () => {
  assert.equal(upstashConfig({}), null);
  assert.equal(upstashConfig({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io" }), null);
  assert.equal(upstashConfig({ UPSTASH_REDIS_REST_URL: "http://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }), null);
  assert.deepEqual(upstashConfig({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }), { url: "https://x.upstash.io", token: "t" });
});

test("limits match the policy", () => {
  assert.deepEqual(LIMITS.loginIp, { limit: 5, windowMs: 15 * 60_000 });
  assert.deepEqual(LIMITS.loginEmail, { limit: 10, windowMs: 60 * 60_000 });
  assert.deepEqual(LIMITS.resetIp, { limit: 3, windowMs: 60 * 60_000 });
  assert.deepEqual(LIMITS.resetEmail, { limit: 3, windowMs: 60 * 60_000 });
  assert.deepEqual(LIMITS.viewIp, { limit: 8, windowMs: 15 * 60_000 });
  assert.deepEqual(LIMITS.exportUser, { limit: 30, windowMs: 10 * 60_000 });
  assert.deepEqual(LIMITS.mfa, { limit: 5, windowMs: 15 * 60_000 });
});

test("email keys are SHA-256 of the lower-cased email: case and spaces don't dodge the limit", () => {
  assert.equal(emailKey("  Someone@Example.TEST "), emailKey("someone@example.test"));
  assert.match(emailKey("a@b.test"), /^[0-9a-f]{64}$/);
  assert.ok(!emailKey("a@b.test").includes("@"));
});

test("a spoofed multi-hop x-forwarded-for can't change the rate-limit key", () => {
  const real = { "x-real-ip": "203.0.113.5", "x-vercel-forwarded-for": "203.0.113.5" };
  const base = trustedClientIp(headers(real), true);
  for (const xff of ["1.1.1.1", "1.1.1.1, 2.2.2.2, 203.0.113.5", "unknown", "", "203.0.113.5, 9.9.9.9"]) {
    assert.equal(trustedClientIp(headers({ ...real, "x-forwarded-for": xff }), true), base, xff);
  }
  assert.equal(base, "203.0.113.5");
  assert.equal(trustedClientIp(headers({ "x-vercel-forwarded-for": "198.51.100.1, 10.0.0.1" }), true), "198.51.100.1");
  assert.equal(trustedClientIp(headers({ "x-forwarded-for": "6.6.6.6" }), false), "local", "off Vercel nothing client-sent is trusted");
});

test("auth actions use the shared limiter and the trusted IP, not the old per-instance one", () => {
  for (const f of ["../app/login/actions.ts", "../app/view/actions.ts", "../app/auth/reset/actions.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(src.includes("requestIp()") && src.includes("hitAll("), f);
    assert.ok(!src.includes("new RateLimiter") && !src.includes("clientIp("), f);
  }
  const login = readFileSync(new URL("../app/login/actions.ts", import.meta.url), "utf8");
  assert.match(login, /\["loginIp", ipK\], \["loginEmail", emailK\]/);
  assert.match(login, /\["resetIp", ipKey\(ip\)\], \["resetEmail", emailKey\(email\)\]/);
});
