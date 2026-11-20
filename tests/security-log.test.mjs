// Phase 7: security event lines carry no private data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatSecurityEvent, hashIp, SECURITY_EVENTS } from "../lib/security-log-core.ts";

const now = new Date("2026-11-21T03:04:05.000Z");

test("one JSON line with event, time and a hashed IP", () => {
  const line = formatSecurityEvent("signin_fail", { ip: "203.0.113.9", status: 400 }, now, "salt-for-tests");
  assert.ok(!line.includes("\n"));
  const o = JSON.parse(line);
  assert.deepEqual(Object.keys(o).sort(), ["event", "ip", "status", "time", "type"]);
  assert.equal(o.type, "security");
  assert.equal(o.event, "signin_fail");
  assert.equal(o.time, "2026-11-21T03:04:05.000Z");
  assert.match(o.ip, /^[0-9a-f]{16}$/);
  assert.ok(!line.includes("203.0.113.9"));
  assert.equal(o.ip, hashIp("203.0.113.9", "salt-for-tests"), "same IP → same hash (countable)");
  assert.notEqual(hashIp("203.0.113.9", "other-salt"), o.ip, "keyed by the salt");
});

test("emails, tokens, passwords, amounts and unknown fields are dropped", () => {
  const line = formatSecurityEvent("turnstile_fail", {
    ip: "198.51.100.1", action: "login", reason: "wrong-hostname",
    email: "someone@example.test", token: "abc.def", password: "hunter2", amount: 5000, name: "Test Person",
  }, now, "s");
  for (const bad of ["someone@example.test", "abc.def", "hunter2", "5000", "Test Person", "198.51.100.1"]) assert.ok(!line.includes(bad), bad);
  const o = JSON.parse(line);
  assert.equal(o.action, "login");
  assert.equal(o.reason, "wrong-hostname");
});

test("even an allowed field can't smuggle an email or long text", () => {
  const o = JSON.parse(formatSecurityEvent("view_fail", { reason: "someone@example.test", status: "x".repeat(100) }, now, "s"));
  assert.equal(o.reason, undefined);
  assert.equal(o.status, undefined);
});

test("the events the brief asks for are all logged where they happen", () => {
  for (const e of ["signin_success", "signin_fail", "mfa_fail", "turnstile_fail", "rate_limit_hit", "view_entry"]) assert.ok(SECURITY_EVENTS.includes(e), e);
  const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  assert.match(read("../app/login/actions.ts"), /logSecurityEvent\("signin_fail"[\s\S]*logSecurityEvent\("signin_success"/);
  assert.match(read("../lib/mfa-actions.ts"), /logSecurityEvent\("mfa_fail"/);
  assert.match(read("../lib/turnstile.ts"), /logSecurityEvent\("turnstile_fail"/);
  assert.match(read("../lib/rate-limit.ts"), /logSecurityEvent\("rate_limit_hit"/);
  assert.match(read("../app/view/actions.ts"), /logSecurityEvent\("view_entry"/);
  for (const f of ["../app/login/actions.ts", "../app/view/actions.ts", "../lib/mfa-actions.ts"])
    assert.ok(!/logSecurityEvent\([^)]*\b(email|password|token|amount)\b/.test(read(f)), `${f}: nothing private passed`);
});
