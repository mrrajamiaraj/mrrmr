// Speed: the server runs in the same region as the database. Supabase is in ap-south-1 (Mumbai), so Vercel functions
// run in bom1 (Mumbai). In Vercel's default region (iad1, Washington DC) every page made several round trips across
// the world to the database, which made each page take about 2 s on a phone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Vercel functions run next to the database (Mumbai)", () => {
  const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(cfg.regions, ["bom1"]);
});
