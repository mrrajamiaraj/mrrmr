// Short vibrations for touch feedback. Works where the browser supports the Vibration API (Chrome, Samsung Internet,
// Firefox and Opera on Android); iOS Safari has none, so there it is silently a no-op. Never runs for people who ask
// for reduced motion, and never for mouse or pen input.

export type Haptic = "tap" | "success" | "error" | "warn" | "tick";

const PATTERN: Record<Haptic, number | number[]> = {
  tap: 8,
  tick: 4,
  success: [12, 60, 18],
  warn: [20, 50, 20],
  error: [35, 60, 35],
};

let lastTouch = 0;
/** Remember that the person is using touch (set by the touch layer), so mouse clicks never vibrate. */
export const noteTouch = () => { lastTouch = Date.now(); };

export function haptic(kind: Haptic = "tap") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (Date.now() - lastTouch > 60_000) return; // no touch in the last minute: a mouse/keyboard session
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try { navigator.vibrate(PATTERN[kind]); } catch { /* some browsers throw inside iframes; ignore */ }
}
