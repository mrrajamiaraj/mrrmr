// Preferences are validated: nothing unknown (or off-site) is ever stored or used. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFS, normalizePrefs } from "../lib/prefs.ts";

test("prefs: defaults for junk, valid values kept, no open redirect via landing page", () => {
  assert.deepEqual(normalizePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(normalizePrefs({ landing: "/debtors", density: "compact", paisa: true }),
    { landing: "/debtors", density: "compact", paisa: true });
  for (const evil of ["https://evil.com", "//evil.com", "/export", "/admin", 42]) assert.equal(normalizePrefs({ landing: evil }).landing, "/account");
  assert.equal(normalizePrefs({ paisa: "yes" }).paisa, false, "only a real true turns paisa on");
});
