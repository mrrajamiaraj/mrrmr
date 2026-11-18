// Decimal-safe money helpers. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toPaisa, fromPaisa, roundMoney, sumMoney, sumBy, subMoney, compareMoney, isPositive, splitInstallments, installmentAmount,
} from "../lib/money.ts";

test("toPaisa parses numbers and Postgres numeric strings exactly", () => {
  assert.equal(toPaisa(1433450.5), 143345050);
  assert.equal(toPaisa("1433450.50"), 143345050);
  assert.equal(toPaisa("1,43,345"), 14334500, "Indian grouping commas are ignored");
  assert.equal(toPaisa(0.1), 10);
  assert.equal(toPaisa("-25.75"), -2575);
  assert.equal(toPaisa(".5"), 50);
  assert.equal(toPaisa("7."), 700);
  assert.equal(toPaisa(0), 0);
});

test("toPaisa rounds the third decimal half away from zero, exactly", () => {
  assert.equal(Math.round(1.005 * 100), 100, "the float bug this replaces");
  assert.equal(toPaisa(1.005), 101);
  assert.equal(toPaisa("1.004"), 100);
  assert.equal(toPaisa("2.675"), 268);
  assert.equal(toPaisa("-1.005"), -101);
});

test("toPaisa rejects non-amounts", () => {
  for (const bad of [NaN, Infinity, -Infinity, "", "  ", "abc", "1.2.3", "--1", null, undefined, {}, [], true]) {
    assert.ok(Number.isNaN(toPaisa(bad)), `should reject ${String(bad)}`);
  }
});

test("roundMoney keeps two decimals; NaN stays NaN", () => {
  assert.equal(roundMoney(10.555), 10.56);
  assert.equal(roundMoney("99.999"), 100);
  assert.ok(Number.isNaN(roundMoney("x")));
  assert.equal(fromPaisa(toPaisa(123456789.12)), 123456789.12);
});

test("sums are exact where float addition drifts", () => {
  assert.notEqual(0.1 + 0.2, 0.3);
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(sumMoney(Array(10).fill(0.1)), 1);
  assert.equal(sumBy([{ a: "100.10" }, { a: 200.2 }, { a: null }], (r) => r.a), 300.3, "null counts as 0");
  assert.equal(subMoney(0.3, 0.1), 0.2);
  assert.equal(subMoney(1000, 999.99), 0.01);
});

test("compareMoney and isPositive work to the paisa", () => {
  assert.equal(compareMoney(0.1 + 0.2, 0.3), 0);
  assert.equal(compareMoney(100.01, 100), 1);
  assert.equal(compareMoney("99.99", 100), -1);
  assert.equal(isPositive(0.004), false, "below half a paisa rounds to 0");
  assert.equal(isPositive(0.005), true);
  assert.equal(isPositive(-1), false);
});

test("splitInstallments: floor per month, last absorbs the remainder, always adds back exactly", () => {
  assert.deepEqual(splitInstallments(1000, 3), [333.33, 333.33, 333.34]);
  assert.deepEqual(splitInstallments(60000, 6), [10000, 10000, 10000, 10000, 10000, 10000]);
  assert.deepEqual(splitInstallments(0.05, 3), [0.01, 0.01, 0.03]);
  assert.equal(Math.floor((1.14 / 3) * 100), 37, "the float bug this replaces");
  assert.deepEqual(splitInstallments(1.14, 3), [0.38, 0.38, 0.38]);
  assert.equal(installmentAmount(1000, 3), 333.33);
  assert.deepEqual(splitInstallments(100, 0), []);
  for (let i = 0; i < 2000; i++) {
    const amountP = 1 + Math.floor(Math.random() * 1e9);
    const parts = 2 + Math.floor(Math.random() * 59);
    const split = splitInstallments(fromPaisa(amountP), parts);
    assert.equal(split.length, parts);
    assert.equal(split.reduce((t, x) => t + toPaisa(x), 0), amountP, `${amountP}p / ${parts}`);
    assert.ok(split.slice(0, -1).every((x) => x === split[0]), "all but the last are equal");
    assert.ok(toPaisa(split[parts - 1]) >= toPaisa(split[0]), "the last is never smaller");
  }
});
