// Preferences are validated: nothing unknown (or off-site) is ever stored or used. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFS, normalizePrefs } from "../lib/prefs.ts";
import { DEFAULT_LAYOUT, normalizeLayout } from "../lib/dashboard-layout.ts";

test("prefs: defaults for junk, valid values kept, no open redirect via landing page", () => {
  assert.deepEqual(normalizePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(normalizePrefs({ landing: "/debtors", density: "compact", paisa: true, chartRange: "year" }),
    { landing: "/debtors", density: "compact", paisa: true, chartRange: "year" });
  for (const evil of ["https://evil.com", "//evil.com", "/export", "/admin", 42]) assert.equal(normalizePrefs({ landing: evil }).landing, "/account");
  assert.equal(normalizePrefs({ paisa: "yes" }).paisa, false, "only a real true turns paisa on");
});

test("dashboard layout: unknown ids dropped, every section kept exactly once", () => {
  assert.deepEqual(normalizeLayout(undefined), DEFAULT_LAYOUT);
  const l = normalizeLayout({ order: ["bank", "bank", "nope", "insights"], hidden: ["cards", "zzz"] });
  assert.equal(l.order[0], "bank");
  assert.equal(l.order[1], "insights");
  assert.equal(new Set(l.order).size, l.order.length);
  assert.equal(l.order.length, DEFAULT_LAYOUT.order.length);
  assert.deepEqual(l.hidden, ["cards"]);
});
