// Money display formats. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { taka, takaExact } from "../lib/format.ts";

test("taka shows whole taka with Indian grouping", () => {
  assert.equal(taka(143345), "৳1,43,345");
  assert.equal(taka(-500), "৳500", "sign is the caller's job");
});

test("takaExact keeps paisa only when the amount isn't whole", () => {
  assert.equal(takaExact(353.33), "৳353.33");
  assert.equal(takaExact(353.35), "৳353.35");
  assert.equal(takaExact(4000), "৳4,000");
  assert.equal(takaExact(143345.5), "৳1,43,345.50");
  assert.equal(takaExact(0.1 + 0.2), "৳0.30", "float noise doesn't leak");
});
