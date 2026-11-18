// Design-token contrast: reads app/globals.css and checks every text/background pair the UI uses against WCAG AA,
// in both themes. Fails if a token edit makes text unreadable. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}
const lightBlock = css.slice(css.indexOf("@theme static"), css.indexOf(":root {"));
const darkBlock = css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf("/* Theme switch"));
const THEMES = { "Executive Minimal": tokens(lightBlock), "Midnight Finance": { ...tokens(lightBlock), ...tokens(darkBlock) } };

const lum = (hex) => {
  const c = hex.slice(1).match(/../g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, minimum] — 4.5 for text, 3 for large text / non-text marks.
const PAIRS = [
  ["ink", "page", 7], ["ink", "surface", 7], ["ink", "rail", 7],
  ["slate-500", "surface", 4.5], ["slate-500", "page", 4.5], ["slate-500", "soft", 4.5], ["slate-500", "rail", 4.5],
  ["slate-600", "surface", 4.5], ["slate-700", "surface", 4.5], ["slate-400", "surface", 3],
  ["brand-ink", "surface", 4.5], ["brand-ink", "good-tint-2", 4.5], ["brand-2", "surface", 4.5], ["brand-2", "subtle", 4.5], ["brand-2", "good-tint", 4.5],
  ["owed", "surface", 4.5], ["owed", "owed-tint", 4.5],
  ["bad", "surface", 4.5], ["bad", "bad-tint", 4.5], ["bad-deep", "bad-tint", 4.5],
  ["info", "surface", 4.5], ["info", "info-tint", 4.5],
  ["on-ink", "ink", 7],
];
const WHITE_ON = ["brand", "brand-hover", "bad-solid"]; // solid fills under white button text

for (const [name, t] of Object.entries(THEMES)) {
  test(`${name}: every text/background pair meets WCAG AA`, () => {
    for (const [fg, bg, min] of PAIRS) {
      assert.ok(t[fg] && t[bg], `missing token ${fg} or ${bg}`);
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= min, `${fg} (${t[fg]}) on ${bg} (${t[bg]}) is ${r.toFixed(2)}:1, needs ${min}:1`);
    }
    for (const fill of WHITE_ON) {
      const r = ratio("#FFFFFF", t[fill]);
      assert.ok(r >= 4.5, `white on ${fill} (${t[fill]}) is ${r.toFixed(2)}:1, needs 4.5:1`);
    }
  });
}
