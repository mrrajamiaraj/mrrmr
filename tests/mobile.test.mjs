// Phone interactions: haptics rules (run under Node with a fake navigator/window) and the wiring of each behaviour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

test("haptics: vibrate only after touch, never for reduced motion, silently absent on iOS", async () => {
  const calls = [];
  let reduce = false;
  Object.defineProperty(globalThis, "navigator", { value: { vibrate: (p) => { calls.push(p); return true; } }, configurable: true });
  globalThis.window = { matchMedia: () => ({ matches: reduce }) };
  const { haptic, noteTouch } = await import("../lib/haptics.ts");

  haptic("tap");
  assert.equal(calls.length, 0, "mouse/keyboard session: no vibration");
  noteTouch();
  haptic("tap");
  haptic("success");
  assert.deepEqual(calls, [8, [12, 60, 18]]);
  reduce = true;
  haptic("tap");
  assert.equal(calls.length, 2, "reduced motion: none");
  reduce = false;
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true }); // iOS Safari: no vibrate()
  assert.doesNotThrow(() => haptic("error"));
});

test("touch layer is mounted for every page and the keyboard resizes the layout on Android", () => {
  const layout = read("../app/layout.tsx");
  assert.match(layout, /<TouchLayer \/>/);
  assert.match(layout, /interactiveWidget: "resizes-content"/);
  const tl = read("../components/touch-layer.tsx");
  assert.match(tl, /e\.pointerType !== "touch"/, "mouse users unaffected");
  assert.match(tl, /display-mode: standalone/, "pull-to-refresh only in the home-screen app");
  assert.match(tl, /router\.refresh\(\)/);
  assert.match(tl, /\[title\], \[data-tip\]/, "long-press shows titles");
  assert.match(tl, /Date\.now\(\) - touchAt < 1000/, "tap vibration only on real taps");
});

test("bottom sheet: drag down to close (touch, phones only), follows the iOS keyboard", () => {
  const m = read("../components/modal.tsx");
  assert.match(m, /e\.pointerType !== "touch" \|\| window\.innerWidth >= 640/);
  assert.match(m, /d\.dy > 120 \|\| \(velocity > 0\.6 && d\.dy > 30\)/);
  assert.match(m, /closest\("button, a, input, select, textarea"\)/, "controls in the bar still work");
  assert.match(m, /window\.visualViewport/);
  assert.match(m, /touch-none/);
});

test("phone tab bar hides on scroll down, returns on scroll up; re-tapping a tab scrolls to top", () => {
  const s = read("../components/shell.tsx");
  assert.match(s, /else if \(y > last \+ 6\) setHidden\(true\)/);
  assert.match(s, /y < last - 6\) setHidden\(false\)/);
  assert.match(s, /onFocus=\{\(\) => setHidden\(false\)\}/, "keyboard focus brings it back");
  assert.match(s, /onClick=\{\(e\) => onTab\(e, on\)\}/);
});

test("toasts: swipe to dismiss and a vibration per tone", () => {
  const t = read("../components/toast.tsx");
  assert.match(t, /Math\.abs\(dx\) > 80\) dismiss/);
  assert.match(t, /haptic\(tone === "error" \? "error"/);
});

test("number fields open the decimal keypad", () => {
  for (const f of ["../components/balance-editor.tsx", "../components/setup-forms.tsx"]) {
    const src = read(f);
    const numbers = src.match(/type="number"[^>]*/g) ?? [];
    assert.ok(numbers.length > 0);
    for (const n of numbers) assert.match(n, /inputMode="decimal"/, `${f}: ${n.slice(0, 60)}`);
  }
});
