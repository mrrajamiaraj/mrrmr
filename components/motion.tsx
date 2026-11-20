"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The server-rendered page is already showing the real figures, so counting up from zero on first load would flash.
// After hydration, anything that mounts (a client navigation, a new tab) or changes does animate.
let hydrated = false;
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/**
 * A number that rolls from its previous value to the new one. `intro`: also count up from zero on the very first
 * page load (for hero figures) — the server-rendered value is hidden until the count starts, so nothing flashes.
 */
export function CountUp({ value, format, duration = 900, intro = false }: { value: number; format: (n: number) => string; duration?: number; intro?: boolean }) {
  const [shown, setShown] = useState(() => (hydrated ? 0 : value));
  const [ready, setReady] = useState(!intro);
  const from = useRef(shown);

  useLayoutEffect(() => {
    if (!intro || ready) return;
    if (!reduceMotion()) { from.current = 0; setShown(0); }
    setReady(true);
  }, [intro, ready]);

  useEffect(() => {
    hydrated = true;
    if (!ready) return;
    const start = from.current;
    if (start === value || reduceMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = easeOutExpo((now - t0) / duration);
      const n = start + (value - start) * k;
      from.current = n;
      setShown(n);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, ready]);

  // The final figure for assistive tech straight away; the rolling digits are visual only.
  return (
    <span className="tabular-nums">
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden="true" style={ready ? undefined : { opacity: 0 }}>{format(shown)}</span>
    </span>
  );
}

/**
 * Measures the active child of a tab row (aria-selected / aria-current) so one underline can slide between tabs.
 * `active` is whatever identifies the current tab; it re-measures when that changes or the row resizes.
 */
export function useSlidingIndicator<T extends HTMLElement>(active: unknown) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const measure = () => {
      const el = row.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]');
      setBox(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [active]);

  return { ref, box };
}

export function Indicator({ box, className = "" }: { box: { left: number; width: number } | null; className?: string }) {
  if (!box) return null;
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-0 h-[2px] rounded-full bg-ink transition-[transform,width] duration-300 ease-[var(--ease-out-expo)] ${className}`}
      style={{ width: box.width, transform: `translateX(${box.left}px)` }}
    />
  );
}

/** Underlined tab row with a sliding indicator. Used for in-page views (not routes). */
export function UnderlineTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  className = "",
}: {
  tabs: [K, string, number | null][];
  value: K;
  onChange: (k: K) => void;
  label: string;
  className?: string;
}) {
  const { ref, box } = useSlidingIndicator<HTMLDivElement>(value);
  return (
    <div ref={ref} role="tablist" aria-label={label} className={`snap-row relative -mb-px flex gap-6 overflow-x-auto [scrollbar-width:none] ${className}`}>
      {tabs.map(([key, text, count]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)}
          className={`whitespace-nowrap pb-3 pt-1 text-[14px] ${value === key ? "font-medium text-ink" : "text-slate-500 hover:text-ink"}`}>
          {text}
          {count != null && (
            <span className={`ml-1.5 inline-flex min-w-5 justify-center rounded-full px-1.5 text-[11.5px] font-medium tabular-nums ${value === key ? "bg-ink text-on-ink" : "bg-soft text-slate-500"}`}>
              {count}
            </span>
          )}
        </button>
      ))}
      <Indicator box={box} />
    </div>
  );
}

export function Spinner({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size }}
      className={`inline-block flex-none animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />
  );
}

/** Staggered entrance: the nth item starts a beat after the one before it, capped so long lists don't drag. */
export const stagger = (i: number, step = 40, max = 400) => ({ animationDelay: `${Math.min(i * step, max)}ms` });
