"use client";

// MRRMR data graphics: hand-built SVG, no chart library. Every chart
//  - draws itself in (line strokes, bars grow, arcs sweep) and stays still for prefers-reduced-motion;
//  - is readable without the picture: a one-line summary for screen readers and a hidden table of the values;
//  - is keyboard-explorable where it is interactive (←/→ move between months).
// Figures come from lib/trends (tested); nothing here computes a balance.

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { taka } from "@/lib/format";

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/** Monotone cubic path through points (no overshoot below the baseline, unlike a plain spline). */
function smoothPath(p: [number, number][]) {
  if (p.length < 2) return p.length ? `M${p[0][0]},${p[0][1]}` : "";
  const n = p.length, dx: number[] = [], m: number[] = [], t: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${p[i][0] + h},${p[i][1] + h * t[i]} ${p[i + 1][0] - h},${p[i + 1][1] - h * t[i + 1]} ${p[i + 1][0]},${p[i + 1][1]}`;
  }
  return d;
}

export type TrendPoint = { key: string; label: string; short: string; value: number };

/**
 * Area chart of one money series over months: a self-drawing line, a glowing fill, a pulsing "now" dot and a crosshair
 * tooltip on hover or arrow keys. `dark` styles it for the dark hero panel.
 */
export function TrendArea({ points, title, height = 170, dark = false, color = "var(--color-owed-bar)" }: {
  points: TrendPoint[]; title: string; height?: number; dark?: boolean; color?: string;
}) {
  const id = useId().replace(/:/g, "");
  const { ref, w } = useWidth<HTMLDivElement>(560);
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const max = Math.max(1, ...points.map((p) => p.value)) * 1.15;
  const padX = 6, top = 14, bottom = 8, h = height;
  const xy = points.map((p, i): [number, number] => [padX + (i * (w - 2 * padX)) / Math.max(n - 1, 1), top + (1 - p.value / max) * (h - top - bottom)]);
  const line = smoothPath(xy);
  const area = xy.length ? `${line} L${xy[n - 1][0]},${h} L${xy[0][0]},${h} Z` : "";
  const last = points[n - 1], first = points[0];
  const i = hover ?? n - 1;
  const change = last && first ? last.value - first.value : 0;
  const ink = dark ? "rgba(255,255,255,0.92)" : "var(--color-ink)";
  const muted = dark ? "rgba(255,255,255,0.55)" : "var(--color-slate-500)";

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = Math.round(((e.clientX - r.left - padX) / (r.width - 2 * padX)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, k)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover(Math.max(0, i - 1)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setHover(Math.min(n - 1, i + 1)); }
    else if (e.key === "Escape") setHover(null);
  };

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[12.5px] font-medium" style={{ color: muted }}>{title}</span>
        <span className="text-[12.5px] tabular-nums" style={{ color: muted }} aria-live="polite">
          <b className="font-semibold" style={{ color: ink }}>{points[i]?.label}</b> · {taka(points[i]?.value ?? 0)}
        </span>
      </figcaption>
      <div ref={ref} tabIndex={0} role="group" aria-label={`${title}. ${first?.label} ${taka(first?.value ?? 0)} to ${last?.label} ${taka(last?.value ?? 0)}, ${change >= 0 ? "up" : "down"} ${taka(change)}. Use the arrow keys to read each month.`}
        aria-describedby={`${id}-t`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)}
        className="relative cursor-crosshair touch-pan-y rounded-lg outline-offset-4" style={{ height: h }}>
        <svg width={w} height={h} className="block overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={dark ? 0.45 : 0.32} />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
            <filter id={`${id}-g`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5" /></filter>
            <clipPath id={`${id}-c`}><rect className="viz-wipe" x="0" y="0" width={w} height={h} /></clipPath>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="0" x2={w} y1={top + g * (h - top - bottom)} y2={top + g * (h - top - bottom)} stroke={dark ? "rgba(255,255,255,0.08)" : "var(--color-line)"} strokeDasharray="2 4" />
          ))}
          <g clipPath={`url(#${id}-c)`}>
            <path d={area} fill={`url(#${id}-f)`} />
            <path d={line} fill="none" stroke={color} strokeWidth="6" opacity={dark ? 0.5 : 0.25} filter={`url(#${id}-g)`} />
          </g>
          <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" pathLength={1} className="viz-draw" />
          {hover != null && (
            <line x1={xy[i][0]} x2={xy[i][0]} y1={0} y2={h} stroke={dark ? "rgba(255,255,255,0.35)" : "var(--color-line-strong)"} strokeDasharray="3 3" />
          )}
          {xy[i] && (
            <g transform={`translate(${xy[i][0]} ${xy[i][1]})`}>
              {hover == null && <circle r="10" fill={color} className="viz-pulse" />}
              <circle r="5" fill={dark ? "#0B1F1A" : "var(--color-surface)"} stroke={color} strokeWidth="2.5" />
            </g>
          )}
        </svg>
      </div>
      <div aria-hidden="true" className="flex justify-between text-[10.5px] tabular-nums" style={{ color: muted }}>
        {points.map((p, k) => <span key={p.key} className={k % (w < 420 ? 3 : 2) === 0 || k === n - 1 ? "" : "invisible"}>{p.short}</span>)}
      </div>
      <table id={`${id}-t`} className="sr-only">
        <caption>{title}</caption>
        <tbody>{points.map((p) => <tr key={p.key}><th scope="row">{p.label}</th><td>{taka(p.value)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

export type FlowMonth = { key: string; label: string; short: string; a: number; b: number };

/**
 * Paired monthly bars: money lent out (brass) and paid back (jade). Each month is a button, so the chart doubles as
 * the month picker; bars grow in one after another.
 */
export function FlowBars({ months, selected, onSelect, aLabel = "Lent out", bLabel = "Paid back", height = 150 }: {
  months: FlowMonth[]; selected?: string; onSelect?: (key: string) => void; aLabel?: string; bLabel?: string; height?: number;
}) {
  const max = Math.max(1, ...months.flatMap((m) => [m.a, m.b]));
  return (
    <figure className="m-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm bg-owed-bar" />{aLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm bg-chart-in" />{bLabel}</span>
      </div>
      <div role="group" aria-label={`${aLabel} and ${bLabel} by month`} className="grid items-end gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
        {months.map((m, i) => {
          const on = m.key === selected;
          return (
            <button key={m.key} type="button" onClick={() => onSelect?.(m.key)} aria-pressed={onSelect ? on : undefined}
              aria-label={`${m.label}: ${aLabel.toLowerCase()} ${taka(m.a)}, ${bLabel.toLowerCase()} ${taka(m.b)}`}
              className={`group flex min-w-0 flex-col items-center gap-1.5 rounded-lg px-0.5 pb-1 pt-2 ${on ? "bg-good-tint ring-1 ring-good-line" : "hover:bg-subtle"} ${onSelect ? "" : "pointer-events-none"}`}>
              <span className="flex w-full items-end justify-center gap-[2px] sm:gap-1" style={{ height }}>
                <span className="viz-grow w-1/2 max-w-3.5 rounded-t-[4px] bg-owed-bar transition-opacity group-hover:opacity-90" style={{ height: `${(m.a / max) * 100}%`, animationDelay: `${i * 45}ms` }} />
                <span className="viz-grow w-1/2 max-w-3.5 rounded-t-[4px] bg-chart-in transition-opacity group-hover:opacity-90" style={{ height: `${(m.b / max) * 100}%`, animationDelay: `${i * 45 + 60}ms` }} />
              </span>
              <span className={`text-[10.5px] tabular-nums ${on ? "font-semibold text-ink" : "text-slate-500"}`}>{m.short}</span>
            </button>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>{aLabel} and {bLabel} by month</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">{aLabel}</th><th scope="col">{bLabel}</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.key}><th scope="row">{m.label}</th><td>{taka(m.a)}</td><td>{taka(m.b)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** Semicircle gauge (e.g. card utilisation). Sweeps to its value; turns red from 80%. The number is real text. */
export function Gauge({ pct, label, sub }: { pct: number; label: string; sub?: string }) {
  const v = Math.min(Math.max(pct, 0), 100);
  const hot = v >= 80;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[180px]">
        <svg viewBox="0 0 200 112" className="block w-full" aria-hidden="true">
          <path d="M16 100 A84 84 0 0 1 184 100" fill="none" stroke="var(--color-soft)" strokeWidth="14" strokeLinecap="round" />
          <path d="M16 100 A84 84 0 0 1 184 100" fill="none" stroke={hot ? "var(--color-bad)" : "var(--color-brand-2)"} strokeWidth="14" strokeLinecap="round"
            pathLength={100} strokeDasharray="100" className="viz-sweep" style={{ ["--to" as string]: 100 - v }} />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className={`money text-[28px] leading-none ${hot ? "text-bad" : ""}`}>{Math.round(v)}%</span>
          <span className="mt-1 text-[11.5px] text-slate-500">{label}</span>
        </div>
      </div>
      {sub && <span className="mt-1.5 text-center text-[12px] text-slate-500">{sub}</span>}
    </div>
  );
}

// ---- Small graphics shared by lists ------------------------------------------------------------------------------

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** "in 3 days" / "today" / "5 days late" — always words, so the colour is never the only signal. */
export function relDays(iso: string, today: string) {
  const d = dayDiff(today, iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "1 day late";
  return d > 0 ? `in ${d} days` : `${-d} days late`;
}

/** A tiny calendar page for a due date: month band, big day number, and a countdown under it. */
export function DateChip({ iso, today, size = "md" }: { iso: string | null; today: string; size?: "sm" | "md" }) {
  if (!iso) {
    return <span className="grid h-12 w-12 flex-none place-items-center rounded-xl border border-dashed border-line-strong text-[10.5px] text-slate-500">No date</span>;
  }
  const late = iso < today, soon = !late && dayDiff(today, iso) <= 7;
  const band = late ? "bg-bad-solid text-white" : soon ? "bg-owed-bar text-white" : "bg-ink/80 text-on-ink";
  const sm = size === "sm";
  return (
    <span className="flex flex-none flex-col items-center gap-1">
      <span className={`flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-center shadow-[var(--shadow-card)] ${sm ? "w-10" : "w-12"} ${late ? "ring-2 ring-bad/25" : ""}`}>
        <span className={`text-[9.5px] font-semibold uppercase tracking-[0.08em] leading-[16px] ${band}`}>{MON[Number(iso.slice(5, 7)) - 1]}</span>
        <span className={`money leading-none ${sm ? "py-1 text-[15px]" : "py-1.5 text-[18px]"}`}>{Number(iso.slice(8, 10))}</span>
      </span>
      <span className={`whitespace-nowrap text-[10.5px] leading-none ${late ? "font-semibold text-bad" : soon ? "font-medium text-owed" : "text-slate-500"}`}>{relDays(iso, today)}</span>
    </span>
  );
}

/** Segmented bar: parts as fractions of the whole, sweeping in; labels live in the caller (never colour alone). */
export function SplitBar({ parts, className = "h-2" }: { parts: { value: number; className: string }[]; className?: string }) {
  const total = parts.reduce((s, p) => s + Math.max(p.value, 0), 0) || 1;
  return (
    <span aria-hidden="true" className={`flex w-full gap-[2px] overflow-hidden rounded-full bg-soft ${className}`}>
      {parts.map((p, i) => p.value > 0 && <span key={i} className={`bar-fill h-full rounded-full ${p.className}`} style={{ width: `${(p.value / total) * 100}%`, animationDelay: `${i * 120}ms` }} />)}
    </span>
  );
}

/** A palette of distinct, theme-safe hues for people in a share strip (decorative; names and amounts are text). */
export const HUES = ["#B8862E", "#16705A", "#2F5583", "#7C3445", "#4A3F78", "#285E5E", "#9A5B2C", "#5E6B2E", "#3D6FA8", "#8E4A86"];

/**
 * "Who owes what": one bar split into a segment per person, sized by what they owe, with a legend of chips.
 * Each chip is a link to that person. The biggest few are named; the rest are grouped.
 */
export function ShareStrip({ items, hrefOf, max = 7 }: { items: { id: string; name: string; value: number }[]; hrefOf: (id: string) => string; max?: number }) {
  const sorted = [...items].filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, max);
  const rest = sorted.slice(max);
  const restSum = rest.reduce((s, x) => s + x.value, 0);
  const total = sorted.reduce((s, x) => s + x.value, 0) || 1;
  const segs = [...top.map((x, i) => ({ ...x, hue: HUES[i % HUES.length] })), ...(restSum ? [{ id: "", name: `${rest.length} others`, value: restSum, hue: "var(--color-slate-400)" }] : [])];
  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden="true" className="flex h-4 w-full gap-[3px] overflow-hidden rounded-full">
        {segs.map((s, i) => (
          <span key={s.name} className="bar-fill h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, background: s.hue, animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-[13px]">
        {segs.map((s) => {
          const body = (<>
            <span aria-hidden="true" className="size-2.5 flex-none rounded-full" style={{ background: s.hue }} />
            <span className="truncate font-medium">{s.name}</span>
            <span className="money text-slate-500">{taka(s.value)}</span>
            <span className="text-[11.5px] text-slate-400">{Math.round((s.value / total) * 100)}%</span>
          </>);
          return (
            <li key={s.name} className="min-w-0">
              {s.id ? <a href={hrefOf(s.id)} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md hover:text-brand-ink">{body}</a>
                : <span className="inline-flex min-h-8 items-center gap-1.5">{body}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Progress ring with content in the middle (e.g. a person's repaid %). */
export function Ring({ pct, size = 64, stroke = 5, color = "var(--color-brand-2)", children }: {
  pct: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const v = Math.min(Math.max(pct, 0), 100);
  return (
    <span className="relative inline-grid flex-none place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-soft)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          pathLength={100} strokeDasharray="100" className="viz-sweep" style={{ ["--to" as string]: 100 - v }} />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}
