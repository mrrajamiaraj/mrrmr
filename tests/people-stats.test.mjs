// People & loans chart figures. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aging, agingKey, dueCalendar, lendingMonths, lentFor, personMonths } from "../lib/people-stats.ts";

const T = "2026-11-21";

test("agingKey: late buckets by days, then next 7 days, later, undated", () => {
  assert.equal(agingKey("2026-09-01", T), "late60");
  assert.equal(agingKey("2026-10-01", T), "late30");
  assert.equal(agingKey("2026-11-20", T), "late1");
  assert.equal(agingKey(T, T), "week");
  assert.equal(agingKey("2026-11-28", T), "week");
  assert.equal(agingKey("2026-11-29", T), "later");
  assert.equal(agingKey(null, T), "undated");
});

test("aging: every bucket present, exact sums, distinct people", () => {
  const open = [
    { personId: "a", iso: "2026-11-10", left: 0.1 }, { personId: "a", iso: "2026-11-11", left: 0.2 },
    { personId: "b", iso: "2026-11-12", left: 100 }, { personId: "c", iso: null, left: 50 },
  ];
  const b = aging(open, T);
  assert.deepEqual(b.map((x) => x.key), ["late60", "late30", "late1", "week", "later", "undated"]);
  const late = b.find((x) => x.key === "late1");
  assert.equal(late.amount, 100.3, "0.1 + 0.2 + 100 exactly");
  assert.equal(late.count, 3);
  assert.equal(late.people, 2);
  assert.equal(b.find((x) => x.key === "undated").amount, 50);
  assert.equal(b.find((x) => x.key === "week").amount, 0);
});

test("dueCalendar: same-day items add up; undated left out", () => {
  const m = dueCalendar([{ personId: "a", iso: "2026-12-01", left: 0.1 }, { personId: "b", iso: "2026-12-01", left: 0.2 }, { personId: "c", iso: null, left: 9 }]);
  assert.deepEqual(m.get("2026-12-01"), { total: 0.3, count: 2 });
  assert.equal(m.size, 1);
});

test("lentFor: loan reasons and others' card purchases (category first), own card spending excluded", () => {
  const data = {
    loans: [{ reason: "Rent", amount: 1000 }, { reason: "Rent", amount: 500 }, { reason: "", amount: 10 }],
    cardUses: [
      { person_id: "p", category: "Electronics", reason_or_place: "Phone shop", amount: 2000, pay_plan: "full", emi_months: null },
      { person_id: null, category: "Food", reason_or_place: "Me", amount: 999, pay_plan: "full", emi_months: null },
    ],
  };
  const r = lentFor(data);
  assert.deepEqual(r.map((x) => [x.name, x.total]), [["Electronics", 2000], ["Rent", 1500], ["Other", 10]]);
  assert.ok(!r.some((x) => x.name === "Food"), "your own card spending isn't lending");
});

test("lendingMonths maps lent/repaid/owed onto chart fields", () => {
  const m = lendingMonths([{ key: "2026-10", lent: 0.3, repaid: 0.1, owedEnd: 5 }]);
  assert.deepEqual(m[0], { key: "2026-10", spent: 0.3, contributed: 0.1, net: -0.2, running: 5, count: 0 });
});

test("personMonths: gap months filled, balance carried, exact sums", () => {
  const rows = [
    { iso: "2026-01-05", borrowed: 1000, repaid: null, balance: 1000 },
    { iso: "2026-01-20", borrowed: null, repaid: 0.1, balance: 999.9 },
    { iso: "2026-03-02", borrowed: null, repaid: 0.2, balance: 999.7 },
  ];
  const m = personMonths(rows);
  assert.deepEqual(m.map((x) => [x.key, x.spent, x.contributed, x.running, x.count]), [
    ["2026-01", 1000, 0.1, 999.9, 2], ["2026-02", 0, 0, 999.9, 0], ["2026-03", 0, 0.2, 999.7, 1],
  ]);
  assert.deepEqual(personMonths([]), []);
});
