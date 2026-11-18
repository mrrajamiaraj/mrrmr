"use client";

import { useMemo, useState } from "react";
import { Avatar, SectionCard, SectionHead } from "@/components/debtors/bits";
import { CountUp } from "@/components/motion";
import { ChevronRight } from "@/components/icons";
import { monthLabel, taka } from "@/lib/format";
import { subMoney, sumBy, sumMoney } from "@/lib/money";
import { usePrefs } from "@/components/prefs";
import type { DueKind } from "@/lib/ledger";

// Validated pair (dataviz validator, light surface): amber = money going out, green = money coming back.
// Protan separation sits in the 6–8 band, so bars are also told apart by position, the legend and the tooltip text.
export const OUT_COLOR = "var(--color-owed-bar)";
export const IN_COLOR = "var(--color-chart-in)";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ৳1.2L, ৳45K, ৳2Cr: short axis labels in the Indian system. */
export function takaCompact(n: number) {
  const a = Math.abs(n);
  const trim = (x: number) => (Math.round(x * 10) / 10).toString();
  if (a >= 1e7) return `৳${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `৳${trim(a / 1e5)}L`;
  if (a >= 1e3) return `৳${trim(a / 1e3)}K`;
  return `৳${Math.round(a)}`;
}

/** Rounds a step up to 1, 2, 2.5 or 5 × 10ⁿ so gridlines land on readable values. */
function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= raw) ?? 10) * p;
}

const ym = (iso: string) => iso.slice(0, 7);
function shiftMonth(key: string, by: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export type Flow = { iso: string; amount: number; dir: "out" | "in" };
type Range = "6" | "12" | "all" | "year";
const RANGES: [Range, string][] = [["6", "6M"], ["12", "12M"], ["all", "All"], ["year", "Years"]];
/** "Nov 2026" for a month key, "2026" for a year key. */
const periodLabel = (key: string) => (key.length === 4 ? key : monthLabel(key));

/**
 * Money out vs money back per month, as paired bars. Each month is one hit target (hover, focus, arrow keys)
 * with a tooltip listing both series; "Table" shows the same numbers without hovering.
 */
export function FlowChart({
  title, sub, flows, today, outLabel = "Money out", inLabel = "Paid back",
}: {
  title: string; sub: string; flows: Flow[]; today: string; outLabel?: string; inLabel?: string;
}) {
  const [range, setRange] = useState<Range>(usePrefs().chartRange);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const months = useMemo(() => {
    if (range === "year") {
      // One bar pair per calendar year, from the first year with activity to this year.
      const endY = Number(today.slice(0, 4));
      const firstY = flows.reduce((m, f) => Math.min(m, Number(f.iso.slice(0, 4))), endY);
      const byKey = new Map<string, { key: string; out: number; in: number }>();
      for (let y = Math.max(firstY, endY - 9); y <= endY; y++) byKey.set(String(y), { key: String(y), out: 0, in: 0 });
      for (const f of flows) {
        const b = byKey.get(f.iso.slice(0, 4));
        if (b) b[f.dir] = sumMoney([b[f.dir], f.amount]);
      }
      return [...byKey.values()];
    }
    const end = ym(today);
    const first = flows.reduce((m, f) => (ym(f.iso) < m ? ym(f.iso) : m), end);
    let start = range === "all" ? first : shiftMonth(end, -(Number(range) - 1));
    if (shiftMonth(start, 36) < end) start = shiftMonth(end, -35); // "All" stays readable: at most 3 years
    const keys: string[] = [];
    for (let k = start; k <= end; k = shiftMonth(k, 1)) keys.push(k);
    const byKey = new Map(keys.map((k) => [k, { key: k, out: 0, in: 0 }]));
    for (const f of flows) {
      const b = byKey.get(ym(f.iso));
      if (b) b[f.dir] = sumMoney([b[f.dir], f.amount]);
    }
    return [...byKey.values()];
  }, [flows, range, today]);

  const max = Math.max(...months.map((m) => Math.max(m.out, m.in)), 0);
  const step = niceStep(max / 4);
  const top = step * 4 || 4;
  // Nothing in range: just the baseline and a note, not a scale of ৳1–৳4.
  const ticks = max ? [4, 3, 2, 1, 0].map((i) => i * step) : [0];
  const sumOut = sumBy(months, (m) => m.out);
  const sumIn = sumBy(months, (m) => m.in);
  const yearly = range === "year";
  const every = months.length > 18 ? 4 : months.length > 12 ? 2 : 1;
  const cur = hover != null ? months[hover] : null;

  return (
    <SectionCard className="flex flex-col">
      <SectionHead id={`flow-${title}`} title={title} sub={sub}
        action={
          <div className="flex items-center gap-1.5">
            <div role="group" aria-label="Time range" className="flex rounded-lg border border-line bg-soft p-0.5">
              {RANGES.map(([k, label]) => (
                <button key={k} type="button" aria-pressed={range === k} onClick={() => { setRange(k); setHover(null); }}
                  className={`min-h-7 rounded-md px-2.5 text-[12.5px] font-medium ${range === k ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-slate-500 hover:text-ink"}`}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" aria-pressed={asTable} onClick={() => setAsTable((t) => !t)}
              className={`min-h-8 rounded-lg border px-2.5 text-[12.5px] font-medium ${asTable ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-slate-600 hover:text-ink"}`}>
              Table
            </button>
          </div>
        } />

      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 px-4 pb-3 sm:px-5">
        <Legend color={OUT_COLOR} label={outLabel} value={sumOut} />
        <Legend color={IN_COLOR} label={inLabel} value={sumIn} />
        <div className="ml-auto text-right">
          <div className="caption">Recovered vs lent, in range</div>
          <div className="money text-[15px]">{sumOut ? Math.round((sumIn / sumOut) * 100) : 0}%</div>
        </div>
      </div>

      {asTable ? (
        <div className="max-h-[260px] overflow-y-auto border-t border-line">
          <table className="w-full border-collapse text-[13.5px]">
            <thead className="sticky top-0 bg-subtle">
              <tr className="text-left text-[12px] uppercase tracking-[0.04em] text-slate-500">
                <th scope="col" className="px-4 py-2 font-medium sm:px-5">{yearly ? "Year" : "Month"}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{outLabel}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium sm:pr-5">{inLabel}</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.key} className="border-t border-soft">
                  <th scope="row" className="px-4 py-2 text-left font-normal text-slate-600 sm:px-5">{periodLabel(m.key)}</th>
                  <td className="money px-4 py-2 text-right">{m.out ? taka(m.out) : "—"}</td>
                  <td className="money px-4 py-2 text-right sm:pr-5">{m.in ? taka(m.in) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative flex flex-auto flex-col px-4 pb-4 sm:px-5" onPointerLeave={() => setHover(null)}>
          {/* Recessive grid: hairlines and muted labels, so the bars carry the weight. */}
          {/* Grows to fill the card when it sits beside a taller one; never shorter than 200px. */}
          <div className="relative min-h-[200px] flex-auto pl-11">
            {!max && (
              <div className="absolute inset-0 left-11 grid place-items-center pb-6 text-center text-[13px] text-slate-500">
                No activity in this range yet.
              </div>
            )}
            {ticks.map((t) => (
              <div key={t} aria-hidden="true" className="absolute inset-x-0 flex items-center" style={{ bottom: `${(t / top) * 100}%`, translate: "0 50%" }}>
                <span className="w-10 pr-2 text-right text-[11px] tabular-nums text-slate-400">{takaCompact(t)}</span>
                <span className={`h-px flex-auto ${t === 0 ? "bg-line-strong" : "bg-soft"}`} />
              </div>
            ))}
            <div role="list" aria-label={`${title}, by ${yearly ? "year" : "month"}`} className="absolute inset-y-0 left-11 right-0 flex items-end"
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = Math.min(Math.max((hover ?? 0) + (e.key === "ArrowRight" ? 1 : -1), 0), months.length - 1);
                setHover(next);
                (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
              }}>
              {months.map((m, i) => {
                const dim = hover != null && hover !== i;
                return (
                  <div key={m.key} role="listitem" tabIndex={0}
                    aria-label={`${periodLabel(m.key)}: ${outLabel} ${taka(m.out)}, ${inLabel} ${taka(m.in)}`}
                    onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)}
                    className="group relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-md outline-offset-0 focus-visible:bg-soft/60">
                    <span aria-hidden="true" className={`absolute inset-x-0.5 inset-y-0 rounded-md bg-soft transition-opacity ${hover === i ? "opacity-60" : "opacity-0"}`} />
                    <Bar value={m.out} top={top} color={OUT_COLOR} dim={dim} delay={i * 30} />
                    <Bar value={m.in} top={top} color={IN_COLOR} dim={dim} delay={i * 30 + 60} />
                  </div>
                );
              })}
            </div>
            {cur && hover != null && (
              <div role="presentation"
                className="pointer-events-none absolute -top-1 z-10 w-[188px] animate-fade-in rounded-lg border border-line bg-surface/95 p-2.5 text-[12.5px] shadow-[var(--shadow-lift)] backdrop-blur"
                style={{ left: `clamp(0px, calc(44px + (100% - 44px) * ${(hover + 0.5) / months.length} - 94px), calc(100% - 188px))` }}>
                <div className="mb-1.5 font-medium text-slate-500">{periodLabel(cur.key)}</div>
                <TipRow color={OUT_COLOR} label={outLabel} value={cur.out} />
                <TipRow color={IN_COLOR} label={inLabel} value={cur.in} />
                <div className="mt-1.5 flex justify-between border-t border-soft pt-1.5 text-slate-500">
                  <span>Net</span>
                  <span className="money text-ink">{subMoney(cur.in, cur.out) >= 0 ? "+" : "−"} {taka(subMoney(cur.in, cur.out))}</span>
                </div>
              </div>
            )}
          </div>
          <div aria-hidden="true" className="flex pl-11 pt-2">
            {months.map((m, i) => {
              const [y, mo] = m.key.split("-");
              const show = i % every === 0 || i === months.length - 1;
              // Phones have half the width per month: label every other one (always keeping the latest).
              const phoneHide = months.length > 6 && i % (every * 2) !== 0 && i !== months.length - 1;
              return (
                <span key={m.key} className={`flex-1 whitespace-nowrap text-center text-[11px] ${hover === i ? "font-medium text-ink" : "text-slate-400"} ${phoneHide ? "max-sm:invisible" : ""}`}>
                  {yearly ? m.key : show ? (mo === "01" || i === 0 ? `${MON[Number(mo) - 1]} ’${y.slice(2)}` : MON[Number(mo) - 1]) : ""}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function Bar({ value, top, color, dim, delay }: { value: number; top: number; color: string; dim: boolean; delay: number }) {
  const h = (value / top) * 100;
  return (
    <span aria-hidden="true"
      className="relative w-[min(14px,40%)] origin-bottom animate-grow-y rounded-t-[4px] transition-[opacity,height] duration-500 ease-[var(--ease-out-expo)]"
      style={{ height: value ? `max(${h}%, 2px)` : 0, background: color, opacity: dim ? 0.35 : 1, animationDelay: `${delay}ms` }} />
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12.5px] text-slate-500">
        <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: color }} />
        {label}
      </div>
      <div className="money text-[18px] leading-tight"><CountUp value={value} format={taka} /></div>
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="flex items-center gap-1.5 text-slate-500">
        <span aria-hidden="true" className="h-[2px] w-3 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="money text-[13.5px] text-ink">{taka(value)}</span>
    </div>
  );
}

export type OwedItem = { id: string; name: string; initials: string; owes: number; dueKind: DueKind; dueShort: string };

/** Who owes the most, as a ranked bar list. Each row opens that person's profile. */
export function OwedRanking({ title = "Who owes most", items, onOpen }: { title?: string; items: OwedItem[]; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const owing = items.filter((p) => p.owes > 0).sort((a, b) => b.owes - a.owes);
  const shown = all ? owing : owing.slice(0, 5);
  const max = owing[0]?.owes ?? 0;
  const total = owing.reduce((s, p) => s + p.owes, 0);

  return (
    <SectionCard className="flex flex-col">
      <SectionHead id="rank-h" title={title} sub={owing.length ? `${owing.length} ${owing.length === 1 ? "person owes" : "people owe"} ${taka(total)} in all.` : "Nobody owes anything right now."} />
      <ol className="m-0 flex list-none flex-col gap-0.5 px-2 pb-3 sm:px-3">
        {shown.map((p, i) => {
          const share = total ? Math.round((p.owes / total) * 100) : 0;
          return (
            <li key={p.id} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
              <button type="button" onClick={() => onOpen(p.id)}
                className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-subtle">
                <span className="w-4 text-right text-[12px] tabular-nums text-slate-400">{i + 1}</span>
                <Avatar text={p.initials} size={30} />
                <span className="flex min-w-0 flex-auto flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-medium group-hover:text-brand-ink">{p.name}</span>
                    <span className="money flex-none text-[13.5px]">{taka(p.owes)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-auto overflow-hidden rounded-full bg-soft">
                      <span className="bar-fill block h-full rounded-full" style={{ width: `${(p.owes / max) * 100}%`, background: OUT_COLOR, animationDelay: `${i * 50}ms` }} />
                    </span>
                    <span className={`w-[92px] flex-none text-right text-[11.5px] ${p.dueKind === "late" ? "font-medium text-bad" : "text-slate-500"}`}>
                      {p.dueKind === "late" ? p.dueShort : `${share}% · ${p.dueShort}`}
                    </span>
                  </span>
                </span>
                <ChevronRight size={14} className="flex-none text-slate-300 transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-slate-500" />
              </button>
            </li>
          );
        })}
      </ol>
      {owing.length > 5 && (
        <button type="button" onClick={() => setAll((a) => !a)}
          className="mx-4 mb-4 mt-auto min-h-9 rounded-lg border border-line text-[13px] font-medium text-slate-600 hover:bg-soft hover:text-ink sm:mx-5">
          {all ? "Show top 5" : `Show all ${owing.length}`}
        </button>
      )}
    </SectionCard>
  );
}

/** A progress ring that draws itself in. `value` is 0–100. */
export function Ring({ value, size = 88, stroke = 8, color = IN_COLOR, children }: {
  value: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(Math.max(value, 0), 100) / 100);
  return (
    <span className="relative inline-grid flex-none place-items-center" style={{ width: size, height: size }}>
      <svg aria-hidden="true" width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-soft)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          style={{ ["--ring-from" as string]: c, animation: "ring 1.1s var(--ease-out-expo) both", transition: "stroke-dashoffset 700ms var(--ease-out-expo)" }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center">{children}</span>
    </span>
  );
}
