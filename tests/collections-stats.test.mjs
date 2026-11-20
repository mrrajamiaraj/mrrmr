// Repayments page figures. Synthetic data only. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionDays, collectionMonths, collectionWeeks, filterRepayments, monthsBack, pace, payers } from "../lib/collections-stats.ts";

const T = "2026-11-21";
const rep = (o) => ({ person_id: "a", amount: 100, paid_on: "2026-11-10", via: "Cash", applies_to: "loan", card_id: null, account_id: null, ...o });

test("monthsBack crosses years", () => {
  assert.equal(monthsBack("2026-03", 0), "2026-03");
  assert.equal(monthsBack("2026-03", 3), "2025-12");
  assert.equal(monthsBack("2026-01", 13), "2024-12");
});

test("collectionMonths: n months ending this month, exact splits, gaps kept, future left out", () => {
  const reps = [
    rep({ amount: 0.1, account_id: "acc" }), rep({ amount: 0.2, applies_to: "card", card_id: "c1" }),
    rep({ paid_on: "2026-09-02", amount: 50 }), rep({ paid_on: "2026-11-30", amount: 999 }),
  ];
  const m = collectionMonths(reps, T, 3);
  assert.deepEqual(m.map((x) => x.key), ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(m[2], { key: "2026-11", total: 0.3, intoBank: 0.1, other: 0.2, loan: 0.1, card: 0.2, count: 2 });
  assert.equal(m[1].total, 0);
  assert.equal(m[0].total, 50);
});

test("collectionWeeks: rolling 7-day windows ending today", () => {
  const w = collectionWeeks([rep({ paid_on: T }), rep({ paid_on: "2026-11-15" }), rep({ paid_on: "2026-11-14", amount: 7 })], T, 2);
  assert.deepEqual(w.map((x) => [x.start, x.end, x.total, x.count]), [["2026-11-08", "2026-11-14", 7, 1], ["2026-11-15", "2026-11-21", 200, 2]]);
});

test("collectionDays adds same-day payments exactly", () => {
  const d = collectionDays([rep({ amount: 0.1 }), rep({ amount: 0.2 }), rep({ paid_on: "2026-12-01" })], T);
  assert.deepEqual(d.get("2026-11-10"), { total: 0.3, count: 2 });
  assert.equal(d.size, 1, "a future-dated entry isn't counted as collected");
});

test("pace compares with the window before; null change when nothing before", () => {
  const p = pace([rep({ paid_on: T, amount: 150 }), rep({ paid_on: "2026-10-01", amount: 100 })], T, 30);
  assert.equal(p.since, "2026-10-23");
  assert.deepEqual([p.now, p.prev, p.change], [150, 100, 50]);
  assert.equal(pace([rep({ paid_on: T })], T).change, null);
});

test("payers: biggest first, ties by most recent", () => {
  const p = payers([rep({ person_id: "a", amount: 0.1 }), rep({ person_id: "a", amount: 0.2, paid_on: "2026-11-12" }), rep({ person_id: "b", amount: 0.3, paid_on: "2026-11-13" })]);
  assert.deepEqual(p.map((x) => [x.id, x.total, x.count, x.last]), [["b", 0.3, 1, "2026-11-13"], ["a", 0.3, 2, "2026-11-12"]]);
});

test("filterRepayments: month, day, method, target, bank and text", () => {
  const reps = [
    rep({ id: 1 }), rep({ id: 2, via: "bKash", account_id: "acc" }), rep({ id: 3, applies_to: "card", card_id: "c1", paid_on: "2026-10-05" }),
  ];
  const ids = (f, t) => filterRepayments(reps, f, t).map((r) => r.id);
  assert.deepEqual(ids({ month: "2026-10" }), [3]);
  assert.deepEqual(ids({ day: "2026-11-10" }), [1, 2]);
  assert.deepEqual(ids({ via: "bKash" }), [2]);
  assert.deepEqual(ids({ to: "loan" }), [1, 2]);
  assert.deepEqual(ids({ to: "c1" }), [3]);
  assert.deepEqual(ids({ bank: "yes" }), [2]);
  assert.deepEqual(ids({ bank: "no" }), [1, 3]);
  assert.deepEqual(ids({ q: "bkash" }), [2]);
  assert.deepEqual(ids({ q: "ayesha" }, (r) => (r.id === 3 ? "Ayesha" : "Karim")), [3]);
});
