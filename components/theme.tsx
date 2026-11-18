"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "@/components/icons";
import { THEME_KEY as KEY } from "@/lib/theme-script";

export type ThemePref = "light" | "dark" | "system";
/** The two MRRMR themes, by their names. `light`/`dark` stay the stored keys, so saved choices keep working. */
export const THEME_NAMES = { light: "Executive Minimal", dark: "Midnight Finance" } as const;
const PAGE = { light: "#F4F4F1", dark: "#0A0D13" };

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

function readPref(): ThemePref {
  try {
    const p = localStorage.getItem(KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}
const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
const resolved = (p: ThemePref) => (p === "system" ? (systemDark() ? "dark" : "light") : p);

function paint(mode: "light" | "dark") {
  document.documentElement.dataset.theme = mode;
  // Keeps the phone browser's toolbar in step with the page.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", PAGE[mode]));
}

/** Saves the choice and repaints. With `from`, the new theme grows out of that point as a circle where supported. */
export function setTheme(pref: ThemePref, from?: { x: number; y: number }) {
  try { localStorage.setItem(KEY, pref); } catch { /* private mode: the choice lasts this visit only */ }
  const mode = resolved(pref);
  const apply = () => { paint(mode); emit(); };
  const same = document.documentElement.dataset.theme === mode;
  if (same || !from || !document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply();
    return;
  }
  const root = document.documentElement;
  const r = Math.hypot(Math.max(from.x, innerWidth - from.x), Math.max(from.y, innerHeight - from.y));
  root.classList.add("theme-vt");
  const t = document.startViewTransition(apply);
  t.ready.then(() =>
    root.animate(
      { clipPath: [`circle(0px at ${from.x}px ${from.y}px)`, `circle(${r}px at ${from.x}px ${from.y}px)`] },
      { duration: 560, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" }
    )
  ).catch(() => {});
  t.finished.finally(() => root.classList.remove("theme-vt"));
}

/** The saved choice and what is actually showing. Server render assumes light; the script has already painted. */
export function useTheme() {
  const pref = useSyncExternalStore(subscribe, readPref, () => "system" as ThemePref);
  const mode = useSyncExternalStore<"light" | "dark">(
    subscribe,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light"
  );

  // While following the system, follow it live too.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => { paint(mq.matches ? "dark" : "light"); emit(); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);

  return { pref, mode };
}

const centre = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** One tap flips light ↔ dark. The icon shows what you'll get, and spins as it swaps. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode } = useTheme();
  const next = mode === "dark" ? "light" : "dark";
  const label = `Switch to ${THEME_NAMES[next]} (${next}) — shortcut T`;
  return (
    <button type="button" onClick={(e) => setTheme(next, centre(e.currentTarget))}
      aria-label={label} title={label}
      className={`group relative grid size-10 flex-none place-items-center overflow-hidden rounded-lg border border-line bg-surface text-slate-600 hover:border-line-strong hover:bg-soft hover:text-ink ${className}`}>
      <span key={mode} className="grid animate-[theme-icon_420ms_var(--ease-spring)_both] place-items-center">
        {mode === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      </span>
    </button>
  );
}

/**
 * Executive Minimal / Midnight Finance / Auto as a radio group. Arrow keys move between options (WAI-ARIA radio
 * pattern): only the checked option is in the Tab order.
 */
export function ThemeSegment({ stacked = false }: { stacked?: boolean }) {
  const { pref } = useTheme();
  const opts: [ThemePref, string, string, React.ReactNode][] = [
    ["light", THEME_NAMES.light, "Light", <SunIcon key="l" size={14} />],
    ["dark", THEME_NAMES.dark, "Dark", <MoonIcon key="d" size={14} />],
    ["system", "Auto", "Follows your device", <MonitorIcon key="s" size={14} />],
  ];
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = (opts.findIndex(([k]) => k === pref) + dir + opts.length) % opts.length;
    const btn = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i];
    btn?.focus();
    setTheme(opts[i][0], btn ? centre(btn) : undefined);
  };
  return (
    <div role="radiogroup" aria-label="Theme" onKeyDown={onKey}
      className={`flex gap-0.5 rounded-lg border border-line bg-soft p-0.5 ${stacked ? "flex-col" : ""}`}>
      {opts.map(([k, name, hint, icon]) => (
        <button key={k} type="button" role="radio" aria-checked={pref === k} tabIndex={pref === k ? 0 : -1}
          aria-label={k === "system" ? "Auto, follows your device" : `${name} (${hint.toLowerCase()})`}
          onClick={(e) => setTheme(k, centre(e.currentTarget))}
          className={`inline-flex min-h-9 flex-1 items-center gap-2 rounded-md px-3 text-[13px] font-medium ${stacked ? "justify-start py-1.5 text-left" : "justify-center"} ${
            pref === k ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-slate-500 hover:text-ink"
          }`}>
          {icon}
          <span className="flex flex-col leading-tight">
            {stacked ? name : k === "system" ? "Auto" : name.split(" ")[0]}
            {stacked && <span className="text-[11.5px] font-normal text-slate-500">{hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
