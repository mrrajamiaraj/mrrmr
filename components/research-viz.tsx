"use client";

// Research ledger graphics: hand-built SVG/HTML, no chart library (same rules as components/viz.tsx).
//  - Everything animates in (arcs sweep, bars grow, lines draw, cells pop) and is still under prefers-reduced-motion.
//  - Every chart can be read without the picture: names and amounts are real text, and each chart has a label or a
//    hidden table for screen readers. Colour is never the only signal.
//  - Interactive parts are buttons or keyboard-explorable groups (←/→), so they work without a pointer.
// Figures come from lib/research-stats (tested); nothing here computes a total.

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSlidingIndicator } from "@/components/motion";
import { addDays, dateLong, monthLabel, taka } from "@/lib/format";
import type { CumPoint, MonthFlow } from "@/lib/research-stats";

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(160, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/** Monotone cubic path through points (never overshoots between points). */
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

const shortMonth = (ym: string) => monthLabel(ym).split(" ")[0];
const signed = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${taka(n)}`;

export const SPENT = "var(--color-owed-bar)";
export const CONTRIB = "var(--color-info)";
export const NET = "var(--color-brand-2)";

// ---- Pill tabs ---------------------------------------------------------------------------------------------------

/** Segmented tabs: a raised pill slides to the chosen tab. Icons and counts are optional. */
export function PillTabs<K extends string>({ tabs, value, onChange, label }: {
  tabs: { key: K; label: string; icon?: React.ReactNode; count?: number | null }[]; value: K; onChange: (k: K) => void; label: string;
}) {
  const { ref, box } = useSlidingIndicator<HTMLDivElement>(value);
  const move = (e: React.KeyboardEvent, by: number) => {
    e.preventDefault();
    const i = tabs.findIndex((t) => t.key === value);
    const next = tabs[(i + by + tabs.length) % tabs.length];
    onChange(next.key);
    (ref.current?.querySelector(`[data-k="${next.key}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div ref={ref} role="tablist" aria-label={label}
      onKeyDown={(e) => { if (e.key === "ArrowRight") move(e, 1); else if (e.key === "ArrowLeft") move(e, -1); }}
      className="relative flex gap-1 overflow-x-auto rounded-2xl border border-line bg-subtle p-1 [scrollbar-width:none]">
      {box && (
        <span aria-hidden="true" className="pointer-events-none absolute bottom-1 top-1 rounded-xl border border-line bg-surface shadow-[var(--shadow-lift)] transition-[transform,width] duration-500 ease-[var(--ease-spring)]"
          style={{ width: box.width, left: 0, transform: `translateX(${box.left}px)` }} />
      )}
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button key={t.key} data-k={t.key} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => onChange(t.key)}
            className={`relative z-10 inline-flex min-h-10 flex-none items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13.5px] transition-colors duration-200 ${on ? "font-semibold text-ink" : "text-slate-500 hover:text-ink"}`}>
            {t.icon && <span aria-hidden="true" className={`transition-transform duration-300 ease-[var(--ease-spring)] ${on ? "scale-110 text-brand-2" : ""}`}>{t.icon}</span>}
            {t.label}
            {t.count != null && (
              <span className={`inline-flex min-w-5 justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums transition-colors ${on ? "bg-ink text-on-ink" : "bg-soft text-slate-500"}`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---- Donut -------------------------------------------------------------------------------------------------------

export type DonutSlice = { name: string; value: number; color: string; sub?: string };

/**
 * Interactive donut with a legend. Hovering a slice or legend row brings it forward and shows it in the middle;
 * clicking picks it (the caller filters by it). The legend rows are the buttons, so it works by keyboard.
 */
export function Donut({ slices, title, picked, onPick, size = 190, centerLabel = "Total" }: {
  slices: DonutSlice[]; title: string; picked?: string; onPick?: (name: string) => void; size?: number; centerLabel?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + Math.max(x.value, 0), 0);
  const focus = hover ?? picked ?? null;
  const cur = slices.find((s) => s.name === focus);
  const gap = slices.length > 1 ? 0.6 : 0;
  let acc = 0;
  const arcs = slices.map((s) => {
    const len = total ? (Math.max(s.value, 0) / total) * 100 : 0;
    const a = { ...s, len, start: acc };
    acc += len;
    return a;
  });

  return (
    <figure className="m-0 flex flex-wrap items-center justify-center gap-5 sm:flex-nowrap sm:justify-start">
      <div className="relative flex-none" style={{ width: size, height: size }} onPointerLeave={() => setHover(null)}>
        <svg viewBox="0 0 100 100" width={size} height={size} className="block -rotate-90" aria-hidden="true">
          <defs>
            <mask id={`${id}-m`}>
              <circle cx="50" cy="50" r="38" fill="none" stroke="#fff" strokeWidth="26" pathLength={100} strokeDasharray="100" className="viz-sweep" style={{ ["--to" as string]: 0 }} />
            </mask>
          </defs>
          <circle cx="50" cy="50" r="38" fill="none" stroke="var(--color-soft)" strokeWidth="12" />
          <g mask={`url(#${id}-m)`}>
            {arcs.map((a) => {
              const on = focus === a.name;
              const dim = focus != null && !on;
              return a.len > 0 && (
                <circle key={a.name} cx="50" cy="50" r="38" fill="none" stroke={a.color} pathLength={100}
                  strokeWidth={on ? 17 : 12} strokeDasharray={`${Math.max(a.len - gap, 0.01)} ${100 - Math.max(a.len - gap, 0.01)}`} strokeDashoffset={-a.start}
                  onPointerEnter={() => setHover(a.name)} onClick={() => onPick?.(a.name)}
                  className={`${onPick ? "cursor-pointer" : ""} transition-[stroke-width,opacity] duration-300 ease-[var(--ease-spring)]`} style={{ opacity: dim ? 0.3 : 1 }} />
              );
            })}
          </g>
        </svg>
        <div key={focus ?? "all"} className="pointer-events-none absolute inset-0 flex animate-pop-in flex-col items-center justify-center px-6 text-center">
          <span className="max-w-full truncate text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">{cur ? cur.name : centerLabel}</span>
          <span className="money text-[22px] leading-tight">{taka(cur ? cur.value : total)}</span>
          <span className="text-[11.5px] text-slate-500">{cur ? `${total ? Math.round((cur.value / total) * 1000) / 10 : 0}%` : `${slices.length} ${slices.length === 1 ? "group" : "groups"}`}</span>
        </div>
      </div>
      <ul aria-label={title} className="m-0 flex min-w-0 flex-auto list-none flex-col gap-1 p-0">
        {arcs.map((a, i) => {
          const on = focus === a.name;
          const share = total ? Math.round((a.value / total) * 1000) / 10 : 0;
          const body = (
            <>
              <span aria-hidden="true" className={`size-2.5 flex-none rounded-full transition-transform duration-300 ${on ? "scale-150" : ""}`} style={{ background: a.color }} />
              <span className="min-w-0 flex-auto">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[13.5px] font-medium">{a.name}</span>
                  <span className="money flex-none text-[13.5px]">{taka(a.value)}</span>
                </span>
                <span aria-hidden="true" className="mt-1 block h-1 overflow-hidden rounded-full bg-soft">
                  <span className="bar-fill block h-full rounded-full" style={{ width: `${share}%`, background: a.color, animationDelay: `${i * 80 + 200}ms` }} />
                </span>
                <span className="mt-0.5 flex justify-between text-[11.5px] text-slate-500"><span>{a.sub}</span><span className="tabular-nums">{share}%</span></span>
              </span>
            </>
          );
          return (
            <li key={a.name} style={{ animationDelay: `${i * 50}ms` }} className="animate-fade-up">
              {onPick ? (
                <button type="button" aria-pressed={picked === a.name} onClick={() => onPick(a.name)}
                  onPointerEnter={() => setHover(a.name)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(a.name)} onBlur={() => setHover(null)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors ${on ? "bg-subtle" : "hover:bg-subtle"} ${picked === a.name ? "ring-1 ring-line-strong" : ""}`}>{body}</button>
              ) : <div className="flex items-center gap-3 px-2.5 py-1.5">{body}</div>}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

// ---- Month flow: spent vs contributed bars + running balance line ----------------------------------------------

/**
 * Paired monthly bars (spent, contributed) with the running balance drawn over them. Hover or ←/→ to read a month;
 * click (or Enter) to select it. Scrolls sideways when there are many months.
 */
export type FlowLabels = {
  /** bar A (the `spent` field), bar B (`contributed`), the line (`running`) and its legend note */
  a: string; b: string; line: string; lineNote?: string;
  /** tooltip label for `net` (B − A in the month) */
  net: string;
  /** e.g. (n) => `${n} expenses`; omit to hide the count line */
  count?: ((n: number) => string) | null;
  /** show the line's value with a + / − sign (a balance that can go either way) */
  signedLine?: boolean;
  colors?: { a: string; b: string; line: string };
};

const RESEARCH_LABELS: FlowLabels = {
  a: "Spent", b: "Contributed", line: "Running", lineNote: "Running balance (contributed − spent so far)", net: "This month",
  count: (n) => `${n} ${n === 1 ? "expense" : "expenses"}`, signedLine: true,
};

export function FlowChart({ months, selected, onSelect, height = 260, labels = RESEARCH_LABELS }: {
  months: MonthFlow[]; selected?: string; onSelect?: (key: string) => void; height?: number; labels?: FlowLabels;
}) {
  const A = labels.colors?.a ?? SPENT, B = labels.colors?.b ?? CONTRIB, L = labels.colors?.line ?? NET;
  const lineText = (n: number) => (labels.signedLine ? signed(n) : taka(n));
  const id = useId().replace(/:/g, "");
  const { ref, w: avail } = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const n = months.length;
  const w = Math.max(avail, n * 38);
  const padX = 10, top = 18, bottom = 6, h = height;
  const band = (w - 2 * padX) / Math.max(n, 1);
  const bw = Math.max(4, Math.min(16, band * 0.3));
  const lo = Math.min(0, ...months.map((m) => m.running));
  const hi = Math.max(1, ...months.flatMap((m) => [m.spent, m.contributed, m.running])) * 1.12;
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * (h - top - bottom);
  const y0 = y(0);
  const cx = (i: number) => padX + band * i + band / 2;
  const line = smoothPath(months.map((m, i) => [cx(i), y(m.running)]));
  const selIdx = months.findIndex((m) => m.key === selected);
  const i = hover ?? (selIdx >= 0 ? selIdx : n - 1);
  const cur = months[i];
  const every = Math.ceil(44 / band);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(n - 1, Math.max(0, Math.floor((e.clientX - r.left - padX) / band))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const go = (k: number) => { e.preventDefault(); const j = Math.min(n - 1, Math.max(0, k)); if (onSelect) onSelect(months[j].key); else setHover(j); };
    if (e.key === "ArrowLeft") go(i - 1);
    else if (e.key === "ArrowRight") go(i + 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(n - 1);
    else if (e.key === "Enter" && cur) onSelect?.(cur.key);
  };

  if (!n) return null;
  const tipLeft = Math.min(Math.max(cx(i), 90), w - 90);

  return (
    <figure className="m-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: A }} />{labels.a}</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: B }} />{labels.b}</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: L }} />{labels.lineNote ?? labels.line}</span>
      </div>
      <div ref={ref} className="overflow-x-auto [scrollbar-width:thin]">
        <div tabIndex={0} role="group" aria-label={`${labels.a} and ${labels.b.toLowerCase()} by month, ${monthLabel(months[0].key)} to ${monthLabel(months[n - 1].key)}. Use the arrow keys to read each month${onSelect ? "; the month you land on is selected" : ""}.`}
          aria-describedby={`${id}-t`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)}
          onClick={() => cur && onSelect?.(cur.key)}
          className={`relative touch-pan-x rounded-lg outline-offset-2 ${onSelect ? "cursor-pointer" : "cursor-crosshair"}`} style={{ width: w, height: h + 22 }}>
          <svg width={w} height={h} className="block overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={A} /><stop offset="1" stopColor={A} stopOpacity="0.55" /></linearGradient>
              <linearGradient id={`${id}-c`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={B} /><stop offset="1" stopColor={B} stopOpacity="0.55" /></linearGradient>
              <filter id={`${id}-g`} x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
            </defs>
            {[0.25, 0.5, 0.75].map((g) => {
              const v = lo + (hi - lo) * (1 - g);
              return (
                <g key={g}>
                  <line x1={0} x2={w} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeDasharray="2 4" />
                  <text x={w - 2} y={y(v) - 4} textAnchor="end" fontSize="10" fill="var(--color-slate-400)" className="tabular-nums">{taka(v)}</text>
                </g>
              );
            })}
            {months.map((m, k) => (
              <rect key={`b${m.key}`} x={padX + band * k + 2} y={top - 8} width={band - 4} height={h - top + 8} rx="8"
                fill={k === selIdx ? "var(--color-good-tint)" : k === hover ? "var(--color-subtle)" : "transparent"} className="transition-[fill] duration-200" />
            ))}
            <line x1={0} x2={w} y1={y0} y2={y0} stroke="var(--color-line-strong)" />
            {months.map((m, k) => {
              const dim = hover != null && hover !== k;
              const ys = y(m.spent), yc = y(m.contributed);
              return (
                <g key={m.key} style={{ opacity: dim ? 0.45 : 1 }} className="transition-opacity duration-200">
                  <rect x={cx(k) - bw - 1} y={ys} width={bw} height={Math.max(y0 - ys, 0)} rx={Math.min(4, bw / 2)} fill={`url(#${id}-s)`} className="viz-bar" style={{ animationDelay: `${Math.min(k * 40, 700)}ms` }} />
                  <rect x={cx(k) + 1} y={yc} width={bw} height={Math.max(y0 - yc, 0)} rx={Math.min(4, bw / 2)} fill={`url(#${id}-c)`} className="viz-bar" style={{ animationDelay: `${Math.min(k * 40, 700) + 60}ms` }} />
                </g>
              );
            })}
            <path d={line} fill="none" stroke={L} strokeWidth="7" opacity="0.22" filter={`url(#${id}-g)`} />
            <path d={line} fill="none" stroke={L} strokeWidth="2.5" strokeLinecap="round" pathLength={1} className="viz-draw" />
            {months.map((m, k) => (
              <circle key={`d${m.key}`} cx={cx(k)} cy={y(m.running)} r={k === i ? 5 : 2.5} fill="var(--color-surface)" stroke={L} strokeWidth="2"
                className="transition-[r] duration-200" />
            ))}
            {cur && hover == null && <circle cx={cx(i)} cy={y(cur.running)} r="10" fill={L} className="viz-pulse" />}
          </svg>
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-5">
            {months.map((m, k) => (
              <span key={m.key} className={`absolute -translate-x-1/2 text-[10.5px] tabular-nums transition-colors ${k === i ? "font-semibold text-ink" : "text-slate-500"} ${k % every === 0 || k === i ? "" : "invisible"}`}
                style={{ left: cx(k) }}>{shortMonth(m.key)}{m.key.endsWith("-01") || k === 0 ? ` ’${m.key.slice(2, 4)}` : ""}</span>
            ))}
          </div>
          {cur && hover != null && (
            <div key={cur.key} className="pointer-events-none absolute z-10 w-[180px] -translate-x-1/2 animate-pop-in rounded-xl bg-ink px-3 py-2.5 text-[12px] text-on-ink shadow-[var(--shadow-pop)]"
              style={{ left: tipLeft, top: 0 }}>
              <div className="text-[12.5px] font-semibold">{monthLabel(cur.key)}</div>
              <div className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
                <span className="opacity-70">{labels.a}</span><span>{taka(cur.spent)}</span>
                <span className="opacity-70">{labels.b}</span><span>{taka(cur.contributed)}</span>
                <span className="opacity-70">{labels.net}</span><span>{signed(cur.net)}</span>
                <span className="opacity-70">{labels.line}</span><span className="font-semibold">{lineText(cur.running)}</span>
              </div>
              {(labels.count || onSelect) && <div className="mt-1 opacity-60">{labels.count ? labels.count(cur.count) : ""}{labels.count && onSelect ? " · " : ""}{onSelect ? "click to open" : ""}</div>}
            </div>
          )}
        </div>
      </div>
      <table id={`${id}-t`} className="sr-only">
        <caption>{labels.a}, {labels.b.toLowerCase()} and {labels.line.toLowerCase()} by month</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">{labels.a}</th><th scope="col">{labels.b}</th><th scope="col">{labels.line}</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.key}><th scope="row">{monthLabel(m.key)}</th><td>{taka(m.spent)}</td><td>{taka(m.contributed)}</td><td>{lineText(m.running)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

// ---- Race: cumulative contributed vs cumulative spent --------------------------------------------------------------

/**
 * Two rising lines — everything contributed so far and everything spent so far — with the gap between them shaded.
 * The gap is the balance. Styled for the dark hero deck.
 */
export type RaceLabels = { a: string; b: string; short: string; ahead: string; shortColor?: string };
const RESEARCH_RACE: RaceLabels = { a: "Contributed", b: "Spent", short: "short", ahead: "ahead" };

/** `contributed` is the upper (blue) line, `spent` the gold one; labels rename them (e.g. Repaid vs Lent). */
export function RaceChart({ points, height = 190, labels = RESEARCH_RACE }: { points: CumPoint[]; height?: number; labels?: RaceLabels }) {
  const short = labels.shortColor ?? "#FFA08F";
  const id = useId().replace(/:/g, "");
  const { ref, w } = useWidth<HTMLDivElement>(520);
  const [hover, setHover] = useState<number | null>(null);
  const pts = [{ key: "start", spent: 0, contributed: 0 }, ...points];
  const n = pts.length;
  const padX = 6, top = 12, bottom = 6, h = height;
  const max = Math.max(1, ...pts.flatMap((p) => [p.spent, p.contributed])) * 1.1;
  const X = (i: number) => padX + (i * (w - 2 * padX)) / Math.max(n - 1, 1);
  const Y = (v: number) => top + (1 - v / max) * (h - top - bottom);
  const cl = pts.map((p, i): [number, number] => [X(i), Y(p.contributed)]);
  const sl = pts.map((p, i): [number, number] => [X(i), Y(p.spent)]);
  const cPath = smoothPath(cl), sPath = smoothPath(sl);
  const band = `${cPath} L${sl[n - 1][0]},${sl[n - 1][1]} ${smoothPath([...sl].reverse()).slice(1).replace(/^[^C]*/, "")} Z`;
  const i = hover ?? n - 1;
  const p = pts[i];
  const gap = p.contributed - p.spent;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left - padX) / (r.width - 2 * padX)) * (n - 1)))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover(Math.max(0, i - 1)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setHover(Math.min(n - 1, i + 1)); }
    else if (e.key === "Escape") setHover(null);
  };

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-white/60">
        <span className="flex gap-3">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#92B5E8]" />{labels.a} so far</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#E8C27A]" />{labels.b} so far</span>
        </span>
        <span aria-live="polite" className="tabular-nums">
          <b className="font-semibold text-white/90">{p.key === "start" ? "Start" : monthLabel(p.key)}</b> · {gap < 0 ? labels.short : labels.ahead} {taka(gap)}
        </span>
      </figcaption>
      <div ref={ref} tabIndex={0} role="group" onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)}
        aria-label={`Cumulative ${labels.a.toLowerCase()} and ${labels.b.toLowerCase()}. By ${monthLabel(points[points.length - 1]?.key ?? "2026-01")}: ${labels.a.toLowerCase()} ${taka(pts[n - 1].contributed)}, ${labels.b.toLowerCase()} ${taka(pts[n - 1].spent)}. Arrow keys read each month.`}
        className="relative cursor-crosshair touch-pan-y rounded-lg outline-offset-4" style={{ height: h }}>
        <svg width={w} height={h} className="block overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-gap`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={gap < 0 ? short : "#7DD4B8"} stopOpacity="0.32" />
              <stop offset="1" stopColor={gap < 0 ? short : "#7DD4B8"} stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id={`${id}-cf`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#92B5E8" stopOpacity="0.18" /><stop offset="1" stopColor="#92B5E8" stopOpacity="0" /></linearGradient>
            <clipPath id={`${id}-w`}><rect className="viz-wipe" x="0" y="0" width={w} height={h} /></clipPath>
            <filter id={`${id}-glow`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5" /></filter>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={w} y1={top + g * (h - top - bottom)} y2={top + g * (h - top - bottom)} stroke="rgba(255,255,255,0.07)" strokeDasharray="2 4" />)}
          <g clipPath={`url(#${id}-w)`}>
            <path d={`${cPath} L${cl[n - 1][0]},${h} L${cl[0][0]},${h} Z`} fill={`url(#${id}-cf)`} />
            <path d={band} fill={`url(#${id}-gap)`} />
            <path d={cPath} fill="none" stroke="#92B5E8" strokeWidth="7" opacity="0.4" filter={`url(#${id}-glow)`} />
            <path d={sPath} fill="none" stroke="#E8C27A" strokeWidth="7" opacity="0.35" filter={`url(#${id}-glow)`} />
          </g>
          <path d={cPath} fill="none" stroke="#92B5E8" strokeWidth="2.5" strokeLinecap="round" pathLength={1} className="viz-draw" />
          <path d={sPath} fill="none" stroke="#E8C27A" strokeWidth="2.5" strokeLinecap="round" pathLength={1} className="viz-draw" style={{ animationDelay: "200ms" }} />
          {hover != null && <line x1={X(i)} x2={X(i)} y1={0} y2={h} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />}
          <line x1={X(i)} x2={X(i)} y1={Y(p.contributed)} y2={Y(p.spent)} stroke={gap < 0 ? short : "#7DD4B8"} strokeWidth="2" strokeDasharray="2 3" />
          <g transform={`translate(${X(i)} ${Y(p.contributed)})`}>
            {hover == null && <circle r="10" fill="#92B5E8" className="viz-pulse" />}
            <circle r="4.5" fill="#0B1F1A" stroke="#92B5E8" strokeWidth="2.5" />
          </g>
          <g transform={`translate(${X(i)} ${Y(p.spent)})`}>
            {hover == null && <circle r="10" fill="#E8C27A" className="viz-pulse" style={{ animationDelay: "1.2s" }} />}
            <circle r="4.5" fill="#0B1F1A" stroke="#E8C27A" strokeWidth="2.5" />
          </g>
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute z-10 w-[160px] -translate-x-1/2 animate-pop-in rounded-lg border border-white/15 bg-[#0A1714]/90 px-3 py-2 text-[11.5px] text-white/80 backdrop-blur"
            style={{ left: Math.min(Math.max(X(i), 84), w - 84), top: -6 }}>
            <div className="grid grid-cols-[1fr_auto] gap-x-2 tabular-nums">
              <span className="text-white/55">{labels.a}</span><span>{taka(p.contributed)}</span>
              <span className="text-white/55">{labels.b}</span><span>{taka(p.spent)}</span>
              <span className="capitalize text-white/55">{gap < 0 ? labels.short : labels.ahead}</span><span className="font-semibold" style={{ color: gap < 0 ? short : "#7DD4B8" }}>{taka(gap)}</span>
            </div>
          </div>
        )}
      </div>
      <div aria-hidden="true" className="flex justify-between text-[10.5px] tabular-nums text-white/45">
        {pts.map((q, k) => <span key={q.key} className={k === 0 || k === n - 1 || k % Math.max(1, Math.ceil(n / 6)) === 0 ? "" : "invisible"}>{q.key === "start" ? "Start" : shortMonth(q.key)}</span>)}
      </div>
    </figure>
  );
}

// ---- Sparkline ---------------------------------------------------------------------------------------------------

export function Sparkline({ values, color, width = 120, height = 34, className = "" }: { values: number[]; color: string; width?: number; height?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i): [number, number] => [(i * width) / (values.length - 1), 3 + (1 - v / max) * (height - 6)]);
  const d = smoothPath(pts);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={`block overflow-visible ${className}`} aria-hidden="true">
      <defs><linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${id}-f)`} className="animate-fade-in" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" pathLength={1} className="viz-draw" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} />
    </svg>
  );
}

// ---- Heatmap: facility × member --------------------------------------------------------------------------------

export type HeatCell = { row: string; col: string; total: number; count: number };

/** A grid of amounts; deeper colour = more money (the amount is also written in each cell). Cells are buttons. */
export function Heatmap({ rows, cols, cells, max, rowMark, colMark, focus, onPick }: {
  rows: string[]; cols: string[]; cells: HeatCell[]; max: number;
  rowMark?: (name: string) => React.ReactNode; colMark?: (name: string) => React.ReactNode;
  focus?: { row?: string; col?: string }; onPick?: (row: string, col: string) => void;
}) {
  const [hover, setHover] = useState<HeatCell | null>(null);
  const get = (r: string, c: string) => cells.find((x) => x.row === r && x.col === c) ?? { row: r, col: c, total: 0, count: 0 };
  const rowTotal = (r: string) => cells.filter((x) => x.row === r).reduce((s, x) => s + x.total, 0);
  const colTotal = (c: string) => cells.filter((x) => x.col === c).reduce((s, x) => s + x.total, 0);
  const hr = hover?.row ?? focus?.row, hc = hover?.col ?? focus?.col;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-1.5 text-[13px]" onPointerLeave={() => setHover(null)}>
        <thead>
          <tr>
            <td />
            {cols.map((c) => (
              <th key={c} scope="col" className={`px-1 pb-1 text-left text-[12px] font-semibold transition-opacity ${hc && hc !== c ? "opacity-40" : ""}`}>
                {colMark ? colMark(c) : c}
                <span className="block text-[11px] font-normal tabular-nums text-slate-500">{taka(colTotal(c))}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r}>
              <th scope="row" className={`whitespace-nowrap pr-2 text-left text-[13px] font-medium transition-opacity ${hr && hr !== r ? "opacity-40" : ""}`}>
                {rowMark ? rowMark(r) : r}
                <span className="block text-[11px] font-normal tabular-nums text-slate-500">{taka(rowTotal(r))}</span>
              </th>
              {cols.map((c, ci) => {
                const x = get(r, c);
                const k = max ? x.total / max : 0;
                const dim = (hr && hr !== r) || (hc && hc !== c);
                const on = hover?.row === r && hover?.col === c;
                const bg = x.total > 0 ? `color-mix(in srgb, var(--color-brand-2) ${Math.round(12 + k * 78)}%, var(--color-surface))` : "var(--color-subtle)";
                const label = `${r} · ${c}: ${taka(x.total)}, ${x.count} ${x.count === 1 ? "expense" : "expenses"}`;
                return (
                  <td key={c} className="p-0">
                    <button type="button" disabled={!x.count || !onPick} aria-label={onPick && x.count ? `${label}. Show these expenses` : label}
                      onPointerEnter={() => setHover(x)} onFocus={() => setHover(x)} onBlur={() => setHover(null)} onClick={() => onPick?.(r, c)}
                      className={`flex h-14 w-full animate-pop-in flex-col items-start justify-center rounded-lg px-2.5 text-left transition-[transform,opacity,box-shadow] duration-200 ease-[var(--ease-spring)] enabled:cursor-pointer enabled:hover:z-10 enabled:hover:scale-[1.06] enabled:hover:shadow-[var(--shadow-lift)] disabled:cursor-default ${dim ? "opacity-35" : ""} ${on ? "ring-2 ring-ink/70" : ""}`}
                      style={{ background: bg, animationDelay: `${Math.min((ri + ci) * 45, 600)}ms`, color: k > 0.55 ? "#fff" : undefined }}>
                      <span className="money text-[13.5px] leading-tight">{x.total ? taka(x.total) : "—"}</span>
                      {x.count > 0 && <span className="text-[11px] leading-tight opacity-75">{x.count} {x.count === 1 ? "entry" : "entries"}</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[12px] text-slate-500">
        <span aria-live="polite" className="min-h-5">{hover ? <><b className="font-semibold text-ink">{hover.row}</b> paid by <b className="font-semibold text-ink">{hover.col}</b>: {taka(hover.total)} · {hover.count} {hover.count === 1 ? "expense" : "expenses"}{max ? ` · ${Math.round((hover.total / max) * 100)}% of the biggest pair` : ""}</> : onPick ? "Hover a cell for details; click it to see those expenses." : ""}</span>
        <span aria-hidden="true" className="flex items-center gap-1.5">Less
          {[0.12, 0.35, 0.58, 0.9].map((k) => <span key={k} className="size-3 rounded-[3px]" style={{ background: `color-mix(in srgb, var(--color-brand-2) ${Math.round(k * 100)}%, var(--color-surface))` }} />)}
          More</span>
      </div>
    </div>
  );
}

// ---- Calendar heatmap: daily spending ------------------------------------------------------------------------------

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

export type CalendarWords = {
  /** e.g. "Daily spending" */
  title: string;
  /** singular / plural item noun: ["expense", "expenses"] */
  item: [string, string];
  /** shown for a day with nothing */
  none: string;
  /** shown when nothing is hovered */
  summary: (days: number, weeks: number) => string;
};
const RESEARCH_CAL: CalendarWords = {
  title: "Daily spending", item: ["expense", "expenses"], none: "nothing spent",
  summary: (n, w) => `${n} spending days in the last ${w} weeks. Click a day to see it.`,
};

/**
 * Weeks as columns, days as rows; each day's colour steps up with its amount. Days with an amount are buttons.
 * `end` may be in the future (a due-date calendar); `today` outlines today's square.
 */
export function CalendarHeat({ days, end, weeks = 26, selected, onPick, today, words = RESEARCH_CAL }: {
  days: Map<string, { total: number; count: number }>; end: string; weeks?: number; selected?: string; onPick?: (iso: string) => void;
  today?: string; words?: CalendarWords;
}) {
  const noun = (n: number) => `${n} ${n === 1 ? words.item[0] : words.item[1]}`;
  const [hover, setHover] = useState<string | null>(null);
  let start = addDays(end, -(weeks * 7 - 1));
  start = addDays(start, -dow(start));
  const cols: string[][] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (dow(d) === 0) cols.push([]);
    cols[cols.length - 1].push(d);
  }
  const vals = [...days.entries()].filter(([k]) => k >= start && k <= end).map(([, v]) => v.total);
  const max = Math.max(1, ...vals);
  const level = (v: number) => (v <= 0 ? 0 : Math.min(4, 1 + Math.floor(Math.sqrt(v / max) * 3.999)));
  const shades = ["var(--color-soft)", "color-mix(in srgb, var(--color-owed-bar) 30%, var(--color-surface))", "color-mix(in srgb, var(--color-owed-bar) 55%, var(--color-surface))", "color-mix(in srgb, var(--color-owed-bar) 78%, var(--color-surface))", "var(--color-owed-bar)"];
  const info = hover ?? selected;
  const iv = info ? days.get(info) : undefined;
  const activeDays = vals.length;

  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="overflow-x-auto pb-1">
        <div className="inline-grid gap-[3px]" style={{ gridTemplateColumns: `22px repeat(${cols.length}, 13px)` }} onPointerLeave={() => setHover(null)}
          role="group" aria-label={`${words.title}, ${dateLong(start)} to ${dateLong(end)}: ${activeDays} days with ${words.item[1]}.`}>
          <span />
          {cols.map((c, ci) => {
            const first = c.find((d) => d.endsWith("-01")) ?? (ci === 0 ? c[0] : undefined);
            return <span key={ci} aria-hidden="true" className="h-4 overflow-visible whitespace-nowrap text-[10px] text-slate-500">{first ? shortMonth(first.slice(0, 7)) : ""}</span>;
          })}
          {DOW.map((name, r) => (
            <span key={name} className="contents">
              <span aria-hidden="true" className="h-[13px] text-[9.5px] leading-[13px] text-slate-500">{r % 2 ? name.slice(0, 2) : ""}</span>
              {cols.map((c, ci) => {
                const d = c.find((x) => dow(x) === r);
                if (!d) return <span key={ci} />;
                const v = days.get(d);
                const lv = level(v?.total ?? 0);
                const on = d === selected;
                const isToday = d === today;
                const cls = `block size-[13px] animate-pop-in rounded-[3px] transition-transform duration-150 ${on ? "ring-2 ring-ink ring-offset-1 ring-offset-surface" : isToday ? "outline outline-2 outline-offset-1 outline-brand-2" : ""}`;
                const style = { background: shades[lv], animationDelay: `${Math.min(ci * 14, 500)}ms` };
                return v && onPick ? (
                  <button key={ci} type="button" aria-pressed={on} aria-label={`${dateLong(d)}${isToday ? " (today)" : ""}: ${taka(v.total)}, ${noun(v.count)}`}
                    onPointerEnter={() => setHover(d)} onFocus={() => setHover(d)} onBlur={() => setHover(null)} onClick={() => onPick(d)}
                    className={`${cls} cursor-pointer hover:scale-150`} style={style} />
                ) : <span key={ci} aria-hidden="true" className={cls} style={style} onPointerEnter={() => setHover(null)} />;
              })}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-500">
        <span aria-live="polite" className="min-h-5">{info ? <><b className="font-semibold text-ink">{dateLong(info)}</b>{info === today ? " (today)" : ""} · {iv ? `${taka(iv.total)} · ${noun(iv.count)}` : words.none}</> : words.summary(activeDays, weeks)}</span>
        <span aria-hidden="true" className="flex items-center gap-1">Less{shades.map((s, k) => <span key={k} className="size-[11px] rounded-[3px]" style={{ background: s }} />)}More</span>
      </figcaption>
    </figure>
  );
}

// ---- Diverging bars: each member's net -------------------------------------------------------------------------------

/** Bars grow left (paid for more than they put in) or right (put in more) from a centre line. */
export function Diverging({ rows }: { rows: { name: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {rows.map((r, i) => {
        const pctW = (Math.abs(r.value) / max) * 50;
        const neg = r.value < 0;
        return (
          <li key={r.name} className="grid grid-cols-[90px_1fr] items-center gap-3 sm:grid-cols-[110px_1fr]">
            <span className="flex items-center gap-1.5 truncate text-[13px] font-medium"><span aria-hidden="true" className="size-2 flex-none rounded-full" style={{ background: r.color }} />{r.name}</span>
            <span className="relative h-7">
              <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
              <span aria-hidden="true" className={`absolute top-1 h-5 rounded-md ${neg ? "bg-bad/80" : "bg-brand-2"}`}
                style={{ width: `${pctW}%`, [neg ? "right" : "left"]: "50%", transformOrigin: neg ? "right" : "left", animation: `grow-x 900ms var(--ease-out-expo) ${i * 90}ms both` }} />
              {/* The figure sits on the other side of the centre line, so it never runs off the edge. */}
              <span className={`money absolute top-1/2 -translate-y-1/2 animate-fade-in whitespace-nowrap text-[12.5px] ${neg ? "text-bad" : "text-brand-2"}`}
                style={{ [neg ? "left" : "right"]: "calc(50% + 8px)", animationDelay: `${i * 90 + 400}ms` }}>
                {signed(r.value)}
              </span>
            </span>
          </li>
        );
      })}
      <li aria-hidden="true" className="grid grid-cols-[90px_1fr] gap-3 text-[11px] text-slate-500 sm:grid-cols-[110px_1fr]">
        <span /><span className="flex justify-between"><span>← paid for more</span><span>put in more →</span></span>
      </li>
    </ul>
  );
}

// ---- Search highlight ----------------------------------------------------------------------------------------------

/** The text with every match of `q` marked. */
export function Mark({ text, q }: { text: string; q: string }) {
  const s = q.trim();
  if (!s) return <>{text}</>;
  const parts = text.split(new RegExp(`(${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded-[3px] bg-owed-tint px-0.5 text-ink ring-1 ring-owed-line">{p}</mark> : p))}</>;
}
