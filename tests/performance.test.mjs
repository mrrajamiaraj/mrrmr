// Speed: the server runs in the same region as the database. Supabase is in ap-south-1 (Mumbai), so Vercel functions
// run in bom1 (Mumbai). In Vercel's default region (iad1, Washington DC) every page made several round trips across
// the world to the database, which made each page take about 2 s on a phone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("phones: no endless decorative repaints, no blur behind moving content, off-screen rows skipped", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const block = css.slice(css.indexOf("@media (pointer: coarse), (max-width: 639.98px) {"));
  assert.ok(block.length > 0);
  assert.match(block, /\.aurora > span, \.deck::before, \.viz-pulse, \.viz-breathe[^{]*\{ animation: none !important; \}/);
  assert.match(block, /\.deck-tile \{ backdrop-filter: none;/);
  assert.match(block, /\[class~="backdrop-blur-md"\][^{]*\{ backdrop-filter: none;/);
  assert.match(block, /\.lazy-row \{ content-visibility: auto;/);
});

test("count-up numbers don't re-render React every frame, and roll shorter on touch screens", () => {
  const m = readFileSync(new URL("../components/motion.tsx", import.meta.url), "utf8");
  assert.match(m, /text\.nodeValue = format\(n\)/);
  assert.match(m, /pointer: coarse\)"\)\.matches \? Math\.min\(duration, 550\)/);
  const d = readFileSync(new URL("../app/(dashboard)/debtors/debtors-view.tsx", import.meta.url), "utf8");
  assert.match(d, /layout !== "cards" \? new Map/, "per-person statements only for the Cards layout");
});

test("tabs: main tabs fully prefetched; client cache kept briefly and cleared by every save", () => {
  const cfg = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(cfg, /staleTimes: \{ dynamic: 60, static: 120 \}/);
  const shell = readFileSync(new URL("../components/shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /aria-current=\{on \? "page" : undefined\} prefetch onClick/, "phone tab bar");
  assert.match(shell, /prefetch=\{t\.primary \? true : undefined\}/, "desktop rail: main tabs only");
  // every data-changing action purges the client cache
  for (const f of ["../lib/actions.ts", "../lib/research-actions.ts"]) assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /revalidatePath\(/);
});

test("pages read the session locally (getClaims), and metadata changes refresh the token", () => {
  for (const f of ["../app/(dashboard)/layout.tsx", "../app/(dashboard)/page.tsx"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(src, /supabase\.auth\.getClaims\(\)/, f);
    assert.doesNotMatch(src, /auth\.getUser\(\)/, f);
  }
  const a = readFileSync(new URL("../lib/actions.ts", import.meta.url), "utf8");
  assert.match(a, /updateUser\(\{ data: \{ prefs: clean \} \}\);[\s\S]{0,400}refreshSession\(\)/, "prefs");
  assert.match(a, /password_changed_at[\s\S]{0,400}refreshSession\(\)/, "password");
  assert.match(readFileSync(new URL("../app/auth/reset/actions.ts", import.meta.url), "utf8"), /refreshSession\(\)/);
});

test("Vercel functions run next to the database (Mumbai)", () => {
  const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(cfg.regions, ["bom1"]);
});
