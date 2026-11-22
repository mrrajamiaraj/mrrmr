// Research ledger chart figures. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { breakdown, cumulative, dailyTotals, matrix, memberBalances, monthlyFlow, nextMonth } from "../lib/research-stats.ts";

const ex = (id, spent_on, facility, member, amount) => ({ id, spent_on, facility, member, description: "", tag: null, amount, created_at: id });
const co = (id, paid_on, member, amount) => ({ id, paid_on, member, note: "Cash", amount, created_at: id });

const expenses = [ex("e1", "2026-01-05", "BHS", "Raja", 0.1), ex("e2", "2026-01-20", "BHS", "Somik", 0.2), ex("e3", "2026-03-02", "NICVD", "Raja", 500)];
const contributions = [co("c1", "2026-01-01", "Raja", 1000), co("c2", "2026-04-10", "Somik", 250)];

test("nextMonth rolls over the year", () => {
  assert.equal(nextMonth("2026-12"), "2027-01");
  assert.equal(nextMonth("2026-09"), "2026-10");
});

test("monthlyFlow fills gap months and keeps an exact running balance", () => {
  const f = monthlyFlow(expenses, contributions);
  assert.deepEqual(f.map((m) => m.key), ["2026-01", "2026-02", "2026-03", "2026-04"]);
  assert.equal(f[0].spent, 0.3, "0.1 + 0.2 is exactly 0.3");
  assert.equal(f[0].running, 999.7);
  assert.equal(f[1].spent, 0);
  assert.equal(f[1].running, 999.7);
  assert.equal(f[2].running, 499.7);
  assert.equal(f[3].running, 749.7);
  assert.equal(f[3].running, f.reduce((s, m) => s + m.net, 0));
  assert.deepEqual(monthlyFlow([], []), []);
});

test("cumulative only rises and ends at the totals", () => {
  const c = cumulative(monthlyFlow(expenses, contributions));
  assert.deepEqual(c.at(-1), { key: "2026-04", spent: 500.3, contributed: 1250 });
  for (let i = 1; i < c.length; i++) assert.ok(c[i].spent >= c[i - 1].spent && c[i].contributed >= c[i - 1].contributed);
});

test("breakdown groups, sorts and drops empty names", () => {
  const b = breakdown(expenses, (e) => e.facility, (e) => e.amount, ["BHS", "NICVD", "BMRC"]);
  assert.deepEqual(b.map((s) => [s.name, s.total, s.count]), [["NICVD", 500, 1], ["BHS", 0.3, 2]]);
  assert.equal(b[1].avg, 0.15);
  assert.equal(b[0].share + b[1].share, 100);
});

test("matrix covers every pair, zeros included", () => {
  const m = matrix(expenses, ["BHS", "NICVD"], ["Raja", "Somik"]);
  assert.equal(m.cells.length, 4);
  assert.equal(m.max, 500);
  assert.deepEqual(m.cells.find((c) => c.facility === "NICVD" && c.member === "Somik"), { facility: "NICVD", member: "Somik", total: 0, count: 0 });
});

test("dailyTotals adds same-day expenses exactly", () => {
  const d = dailyTotals([...expenses, ex("e4", "2026-01-05", "BHS", "Adnan", 0.2)]);
  assert.deepEqual(d.get("2026-01-05"), { total: 0.3, count: 2 });
});

test("settlement: members = contributions + expenses paid; the leader = total expenses − everyone else", () => {
  // total expenses 500.3; Somik 250 + 0.2 = 250.2; Adnan 0; Raja 500.3 − 250.2 = 250.1
  const b = memberBalances(expenses, contributions, ["Raja", "Somik", "Adnan"], "Raja");
  assert.deepEqual(b[1], { name: "Somik", contributed: 250, spent: 0.2, given: 250.2, leader: false, logs: 1, share: 50 });
  assert.equal(b[0].leader, true);
  assert.equal(b[0].given, 250.1, "exact to the paisa");
  assert.equal(b[2].given, 0);
  assert.equal(b.reduce((s, r) => s + r.given * 100, 0) / 100, 500.3, "settlements add up to total expenses");
  // the leader is always listed, even with nothing recorded under their name
  assert.equal(memberBalances(expenses, contributions, ["Somik"], "Raja")[0].name, "Raja");
});
