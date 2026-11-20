"use client";

// Research ledger graphics: an interactive donut, member bars and a diverging settlement chart. Hand-built SVG/CSS like
// components/viz.tsx — they draw themselves in, stay still for reduced motion, and every value is also real text.

import { useId, useState } from "react";
import { taka } from "@/lib/format";

export type Slice = { name: string; value: number; color: string; note?: string };

/**
 * Donut of shares. Hover or focus a segment (or its legend row) to read it in the centre; click to pick it.
 * `selected` highlights the picked slice, the others dim.
 */
export function Donut({ slices, title, selected, onSelect, size = 200, unit = "spent" }: {
  slices: Slice[]; title: string; selected?: string; onSelect?: (name: string) => void; size?: number; unit?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + Math.max(x.value, 0), 0) || 1;
  const stroke = size * 0.13, r = (size - stroke) / 2 - 4, c = size / 2;
  const focus = hover ?? selected ?? null;
  const cur = slices.find((s) => s.name === focus);
  let acc = 0;
  const segs = slices.filter((s) => s.value > 0).map((s) => {
    const len = (s.value / total) * 100;
    const seg = { ...s, start: acc, len };
    acc += len;
    return seg;
  });
  const gap = segs.length > 1 ? 0.6 : 0;

  return (
    <figure className="m-0 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 overflow-visible" aria-hidden="true">
          <defs>
            <mask id={`${id}-m`}>
              <circle cx={c} cy={c} r={r} fill="none" stroke="#fff" strokeWidth={stroke + 16} pathLength={100} strokeDasharray="100"
                className="viz-sweep" style={{ ["--to" as string]: 0 }} />
            </mask>
          </defs>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-soft)" strokeWidth={stroke} />
          <g mask={`url(#${id}-m)`}>
            {segs.map((s) => {
              const on = focus === s.name, dim = focus != null && !on;
              return (
                <circle key={s.name} cx={c} cy={c} r={r} fill="none" stroke={s.color} pathLength={100}
                  strokeWidth={on ? stroke + 8 : stroke} strokeDasharray={`${Math.max(s.len - gap, 0.01)} ${100 - Math.max(s.len - gap, 0.01)}`} strokeDashoffset={-s.start}
                  className="cursor-pointer transition-[stroke-width,opacity] duration-300 ease-[var(--ease-spring)]" opacity={dim ? 0.3 : 1}
                  onPointerEnter={() => setHover(s.name)} onPointerLeave={() => setHover(null)} onClick={() => onSelect?.(s.name)} />
              );
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div key={focus ?? "all"} className="flex max-w-[64%] animate-fade-in flex-col items-center">
            <span className="truncate text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">{cur ? cur.name : "Total"}</span>
            <span className="money text-[clamp(18px,5vw,24px)] leading-tight">{taka(cur ? cur.value : total)}</span>
            <span className="text-[11.5px] text-slate-500">{cur ? `${Math.round((cur.value / total) * 1000) / 10}% of ${unit}` : `${segs.length} ${segs.length === 1 ? "part" : "parts"}`}</span>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">{title}</figcaption>
      <ul className="m-0 flex w-full min-w-0 list-none flex-col gap-1 p-0">
        {slices.map((s, i) => {
          const on = selected === s.name, pct = (s.value / total) * 100;
          return (
            <li key={s.name} className="animate-fade-up" style={{ animationDelay: `${Math.min(i * 50, 400)}ms` }}>
              <button type="button" onClick={() => onSelect?.(s.name)} aria-pressed={onSelect ? on : undefined}
                onPointerEnter={() => setHover(s.name)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(s.name)} onBlur={() => setHover(null)}
                className={`group flex w-full min-w-0 flex-col gap-1 rounded-lg px-2.5 py-1.5 text-left transition-colors ${on ? "bg-good-tint ring-1 ring-good-line" : "hover:bg-subtle"}`}>
                <span className="flex w-full min-w-0 items-center gap-2 text-[13.5px]">
                  <span aria-hidden="true" className="size-2.5 flex-none rounded-full" style={{ background: s.color }} />
                  <span className="min-w-0 flex-auto truncate font-medium">{s.name}</span>
                  <span className="money flex-none">{taka(s.value)}</span>
                  <span className="w-11 flex-none text-right text-[11.5px] tabular-nums text-slate-500">{Math.round(pct * 10) / 10}%</span>
                </span>
                <span aria-hidden="true" className="block h-1 w-full overflow-hidden rounded-full bg-soft">
                  <span className="bar-fill block h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, background: s.color, animationDelay: `${i * 70 + 200}ms` }} />
                </span>
                {s.note && <span className="text-[11.5px] text-slate-500">{s.note}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export type NetRow = { name: string; color: string; contributed: number; spent: number; net: number };

/**
 * Settlement as a diverging chart: a centre line at zero; a member who put in more than they paid for extends right
 * (jade), one who paid for more than they put in extends left (red). The words say which, so colour isn't the only cue.
 */
export function DivergingNet({ rows, onPick }: { rows: NetRow[]; onPick?: (name: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rows.map((r, i) => {
        const w = (Math.abs(r.net) / max) * 50;
        const pos = r.net >= 0;
        return (
          <li key={r.name} className="animate-fade-up" style={{ animationDelay: `${Math.min(i * 60, 480)}ms` }}>
            <button type="button" onClick={() => onPick?.(r.name)} disabled={!onPick}
              className="grid w-full grid-cols-[minmax(84px,120px)_minmax(0,1fr)] items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-subtle disabled:hover:bg-transparent sm:grid-cols-[140px_minmax(0,1fr)_150px]">
              <span className="flex min-w-0 items-center gap-2 text-[14px] font-medium">
                <span aria-hidden="true" className="size-2.5 flex-none rounded-full" style={{ background: r.color }} />
                <span className="truncate">{r.name}</span>
              </span>
              <span aria-hidden="true" className="relative block h-7">
                <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                {r.net !== 0 && (
                  <span className={`bar-fill absolute top-1 h-5 ${pos ? "left-1/2 rounded-r-md bg-brand-2" : "right-1/2 rounded-l-md bg-bad-solid"}`}
                    style={{ width: `${Math.max(w, 1)}%`, transformOrigin: pos ? "left" : "right", animationDelay: `${i * 80 + 150}ms` }} />
                )}
              </span>
              <span className="col-span-2 flex items-baseline justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end sm:gap-0">
                <span className={`money text-[15px] ${r.net < 0 ? "text-bad" : r.net > 0 ? "text-brand-2" : ""}`}>{r.net > 0 ? "+" : ""}{taka(r.net)}</span>
                <span className="text-[11.5px] text-slate-500">{r.net > 0 ? "put in more than paid for" : r.net < 0 ? "paid for more than put in" : "even"}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A big circular "coverage" meter: how much of the spending contributions cover. Green when fully covered. */
export function CoverageRing({ pct, size = 132, dark = false }: { pct: number; size?: number; dark?: boolean }) {
  const v = Math.max(pct, 0);
  const full = v >= 100;
  const stroke = 11, r = (size - stroke) / 2;
  const color = full ? "#7DD4B8" : v >= 75 ? "#E8C27A" : "#FF8A7A";
  return (
    <span className="relative inline-grid flex-none place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? "rgba(255,255,255,0.1)" : "var(--color-soft)"} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          pathLength={100} strokeDasharray="100" className="viz-sweep" style={{ ["--to" as string]: 100 - Math.min(v, 100), filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <span className="relative flex flex-col items-center leading-none">
        <span className="money text-[26px]">{Math.round(v)}%</span>
        <span className={`mt-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] ${dark ? "text-white/55" : "text-slate-500"}`}>covered</span>
      </span>
    </span>
  );
}
