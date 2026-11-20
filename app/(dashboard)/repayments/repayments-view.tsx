"use client";

// Repayments: everything about getting paid back. Three views over the same tested figures —
//   To collect — what's still owed by how late it is, the collection queue (filter by band) and who owes most;
//   Collected  — month by month (into the bank vs kept as cash), a daily calendar, how it was paid, what it paid off
//                and who paid; every chart filters the payment list underneath;
//   Data checks — deterministic checks on the records (lib/anomalies), filterable by severity.
// Figures: lib/dashboard (open items), lib/ledger (profiles), lib/people-stats (aging), lib/collections-stats
// (collections, tested). Charts are hand-built SVG/HTML; motion stops for prefers-reduced-motion.

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell, useViewer } from "@/components/shell";
import { Avatar, Flash } from "@/components/debtors/bits";
import { RepayDialog } from "@/components/debtors/person-dialogs";
import { repayTargets } from "@/components/debtors/repay-form";
import { RepayPicker } from "@/components/dashboard";
import { Badge, Button, EmptyState, Money, type BadgeTone } from "@/components/ui";
import { AlertIcon, BankIcon, CheckIcon, ChevronRight, CloseIcon, DueIcon, EyeIcon, InfoIcon, InIcon, PeopleIcon, SearchIcon, ShieldIcon, TrendIcon } from "@/components/icons";
import { usePalettePeople } from "@/components/command-palette";
import { CountUp, stagger } from "@/components/motion";
import { DateChip, HUES, Ring } from "@/components/viz";
import { CalendarHeat, Donut, Mark, PillTabs } from "@/components/research-viz";
import { computeDashboard, type OpenItem } from "@/lib/dashboard";
import { findAnomalies, type Anomaly } from "@/lib/anomalies";
import { buildProfiles, byOwesThenName, cardLabel, type Profile } from "@/lib/ledger";
import { aging, agingKey, type AgingKey } from "@/lib/people-stats";
import { breakdown } from "@/lib/research-stats";
import { collectionDays, collectionMonths, collectionWeeks, filterRepayments, pace, payers, type CollectMonth, type CollectWeek, type RepFilter } from "@/lib/collections-stats";
import { addDays, dateLong, dateShort, initials, monthLabel, taka } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { FinanceData, Repayment } from "@/lib/types";

type View = "collect" | "collected" | "checks";
type Queue = "all" | "overdue" | "week" | "month" | "later";

const BANK = "var(--color-brand-2)";
const CASH = "var(--color-info)";
const AGING_COLOR: Record<AgingKey, string> = {
  late60: "#8E2A20", late30: "#B8452F", late1: "#D9774F", week: "#C79A3A", later: "#3F9A75", undated: "#8A8F98",
};
const SEV: Record<Anomaly["severity"], { label: string; tone: BadgeTone; color: string }> = {
  high: { label: "High", tone: "bad", color: "var(--color-bad)" },
  medium: { label: "Medium", tone: "owed", color: "var(--color-owed-bar)" },
  low: { label: "Low", tone: "info", color: "var(--color-info)" },
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function RepaymentsView({ data, today }: { data: FinanceData; today: string }) {
  const viewer = useViewer();
  const router = useRouter();
  const [view, setView] = useState<View>("collect");
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [flash, setFlash] = useState("");
  const [queue, setQueue] = useState<Queue>("all");

  const d = useMemo(() => computeDashboard(data, today), [data, today]);
  const profiles = useMemo(() => buildProfiles(data, today).sort(byOwesThenName), [data, today]);
  const anomalies = useMemo(() => findAnomalies(data, d, today), [data, d, today]);
  const weeks = useMemo(() => collectionWeeks(data.repayments, today, 12), [data.repayments, today]);
  const p30 = useMemo(() => pace(data.repayments, today, 30), [data.repayments, today]);
  usePalettePeople(profiles, (id) => id && router.push(`/debtors/${id}`));

  const owing = profiles.filter((p) => p.owes > 0);
  const owedTotal = sumBy(owing, (p) => p.owes);
  const upcoming = d.open.filter((o) => o.iso && o.iso >= today && o.iso <= addDays(today, 30));
  const onTrack = owedTotal ? Math.max(0, Math.min(100, ((owedTotal - d.overdue.amount) / owedTotal) * 100)) : 100;
  const recentCount = data.repayments.filter((r) => r.paid_on >= p30.since && r.paid_on <= today).length;
  const high = anomalies.filter((a) => a.severity === "high").length;
  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;
  const pv = openId ? profiles.find((p) => p.id === openId) : undefined;
  const goQueue = (q: Queue) => { setQueue(q); setView("collect"); };

  const hero = (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-[720px]">
          <div className="eyebrow flex items-center gap-2">
            <TrendIcon size={14} className="text-brand-2" />Lending
            {viewer && <Badge tone="info" className="ml-1 normal-case tracking-normal"><EyeIcon size={12} />View only</Badge>}
          </div>
          <h1 className="m-0 mt-2 font-display text-title font-normal text-ink">Repayments</h1>
          <p className="m-0 mt-2 text-[14.5px] text-slate-500">What&apos;s still to collect and when, what came in and how, and anything in the records that needs a look.</p>
        </div>
        {!viewer && owing.length > 0 && (
          <Button onClick={() => setPicking(true)} className="shine w-full sm:w-auto"><InIcon size={15} />Record a repayment</Button>
        )}
      </div>

      <section aria-label="Repayments at a glance" className="deck grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-5">
            <div className="relative grid size-[118px] flex-none place-items-center">
              <span aria-hidden="true" className="viz-breathe absolute inset-2 rounded-full bg-[radial-gradient(closest-side,rgba(125,212,184,0.3),transparent)]" />
              <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden="true">
                <defs><linearGradient id="rp-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7DD4B8" /><stop offset="1" stopColor="#E8C27A" /></linearGradient></defs>
                <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,160,143,0.35)" strokeWidth="9" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="url(#rp-ring)" strokeWidth="9" strokeLinecap="round" pathLength={100} strokeDasharray="100"
                  className="viz-sweep" style={{ ["--to" as string]: 100 - onTrack }} />
              </svg>
              <span className="relative flex flex-col items-center text-white">
                <span className="money text-[24px] leading-none"><CountUp value={Math.round(onTrack)} format={(n) => `${Math.round(n)}%`} duration={1400} intro /></span>
                <span className="mt-1 text-center text-[10px] uppercase leading-tight tracking-[0.1em] text-white/55">not<br />overdue</span>
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/60">Collected, last 30 days</span>
              <span className="money text-[clamp(36px,5.5vw,56px)] font-medium leading-none tracking-[-0.03em] text-[#7DD4B8]">
                <CountUp value={p30.now} format={taka} duration={1400} intro />
              </span>
              <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-white/55">
                {plural(recentCount, "payment")} since {dateShort(p30.since)}
                {p30.change != null && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[11.5px] font-semibold ${p30.change >= 0 ? "bg-[#7DD4B8]/15 text-[#7DD4B8]" : "bg-[#FFA08F]/15 text-[#FFA08F]"}`}>
                    <span aria-hidden="true">{p30.change >= 0 ? "▲" : "▼"}</span>{Math.abs(p30.change)}%<span className="sr-only">{p30.change >= 0 ? " more" : " less"}</span> vs the 30 days before
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <HeroTile label="Still owed" icon={<PeopleIcon size={13} className="text-[#E8C27A]" />} value={owedTotal} note={plural(owing.length, "person", "people")} onClick={() => goQueue("all")} />
            <HeroTile label="Overdue" icon={<DueIcon size={13} className="text-[#FFA08F]" />} value={d.overdue.amount} hot={d.overdue.amount > 0} note={d.overdue.count ? plural(d.overdue.count, "item") : "Nothing late"} onClick={() => goQueue("overdue")} />
            <HeroTile label="Due in 30 days" icon={<TrendIcon size={13} className="text-[#7DD4B8]" />} value={sumBy(upcoming, (o) => o.left)} note={plural(upcoming.length, "item")} onClick={() => goQueue("month")} />
            <button type="button" onClick={() => setView("checks")} className="deck-tile flex flex-col gap-1 p-4 text-left transition-colors">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55"><ShieldIcon size={13} className="text-[#92B5E8]" />Data checks</span>
              <span className={`money text-[20px] leading-tight ${high ? "text-[#FFA08F]" : "text-white"}`}><CountUp value={anomalies.length} format={(n) => String(Math.round(n))} duration={1100} intro /></span>
              <span className="text-[12px] text-white/55">{anomalies.length ? (high ? `${high} high` : "to look at") : "All clear"}</span>
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center">
          <WeekBars weeks={weeks} />
        </div>
      </section>
    </header>
  );

  return (
    <Shell subtitle="" hero={hero}>
      <PillTabs label="Repayment views" value={view} onChange={setView} tabs={[
        { key: "collect", label: "To collect", icon: <DueIcon size={15} />, count: d.open.length },
        { key: "collected", label: "Collected", icon: <InIcon size={15} />, count: data.repayments.length },
        { key: "checks", label: "Data checks", icon: <ShieldIcon size={15} />, count: anomalies.length },
      ]} />

      <Flash text={flash} />

      <div key={view} className="flex animate-fade-up flex-col gap-5 sm:gap-6">
        {view === "collect" && <ToCollect open={d.open} today={today} owing={owing} cards={data.cards} viewer={viewer} queue={queue} setQueue={setQueue} onRepay={setOpenId} />}
        {view === "collected" && <Collected data={data} today={today} />}
        {view === "checks" && <Checks anomalies={anomalies} />}
      </div>

      {picking && (
        <RepayPicker people={owing.map((p) => ({ id: p.id, name: p.name, owes: p.owes, status: p.status }))}
          onPick={(id) => { setPicking(false); setOpenId(id); }} onClose={() => setPicking(false)} />
      )}
      {pv && (
        <RepayDialog p={pv} targets={repayTargets(pv, data.cards)} account={account}
          onClose={() => setOpenId(null)} onSaved={(t) => { setOpenId(null); setFlash(t); }} />
      )}
    </Shell>
  );
}

function HeroTile({ label, icon, value, note, hot = false, onClick }: { label: string; icon: React.ReactNode; value: number; note: string; hot?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="deck-tile flex min-w-0 flex-col gap-1 p-4 text-left transition-colors">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">{icon}{label}</span>
      <span className={`money truncate text-[20px] leading-tight ${hot ? "text-[#FFA08F]" : "text-white"}`}><CountUp value={value} format={taka} duration={1300} intro /></span>
      <span className="truncate text-[12px] text-white/55">{note}</span>
    </button>
  );
}

// ---- Hero chart: collected per week ----------------------------------------------------------------------------------

/** Twelve weekly bars on the dark deck, the 12-week average as a dashed line. Hover or ←/→ to read a week. */
function WeekBars({ weeks }: { weeks: CollectWeek[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = weeks.length;
  const max = Math.max(1, ...weeks.map((w) => w.total));
  const avg = sumBy(weeks, (w) => w.total) / Math.max(n, 1);
  const i = hover ?? n - 1;
  const cur = weeks[i];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover(Math.max(0, i - 1)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setHover(Math.min(n - 1, i + 1)); }
  };
  if (!n) return null;
  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/60">Collected each week</span>
        <span aria-live="polite" className="text-[12.5px] text-white/70">
          <b className="font-semibold text-white">{dateShort(cur.start)} – {dateShort(cur.end)}</b> · <span className="money text-[#7DD4B8]">{taka(cur.total)}</span> · {plural(cur.count, "payment")}
        </span>
      </figcaption>
      <div tabIndex={0} role="group" aria-label={`Money collected in each of the last ${n} weeks. Use the arrow keys to read each week.`}
        onKeyDown={onKey} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}
        className="relative grid h-[150px] items-end gap-1.5 rounded-lg outline-offset-4 sm:h-[170px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {avg > 0 && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-[#E8C27A]/70" style={{ bottom: `${(avg / max) * 100}%` }}>
            <span className="absolute -top-4 right-0 text-[10px] text-[#E8C27A]/90">avg {taka(avg)}</span>
          </span>
        )}
        {weeks.map((w, k) => {
          const on = k === i;
          return (
            <span key={w.start} onPointerEnter={() => setHover(k)} className="flex h-full cursor-crosshair flex-col justify-end">
              <span aria-hidden="true" className={`viz-grow block w-full rounded-t-md transition-[opacity,filter] duration-200 ${on ? "brightness-125" : hover != null ? "opacity-45" : ""}`}
                style={{ height: `${Math.max((w.total / max) * 100, w.total ? 3 : 1.5)}%`, animationDelay: `${k * 55}ms`,
                  background: w.total ? (k === n - 1 ? "linear-gradient(#E8C27A, rgba(232,194,122,0.45))" : "linear-gradient(#7DD4B8, rgba(125,212,184,0.35))") : "rgba(255,255,255,0.12)",
                  boxShadow: on && w.total ? "0 0 18px rgba(125,212,184,0.45)" : undefined }} />
            </span>
          );
        })}
      </div>
      <div aria-hidden="true" className="grid text-[10px] text-white/45" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {weeks.map((w, k) => <span key={w.start} className={`text-center ${k === i ? "font-semibold text-white" : ""} ${k % 3 === 2 || k === i ? "" : "invisible"}`}>{k === n - 1 ? "this wk" : dateShort(w.end)}</span>)}
      </div>
    </figure>
  );
}

// ---- To collect ---------------------------------------------------------------------------------------------------

const QUEUES: [Queue, string][] = [["all", "Everything"], ["overdue", "Overdue"], ["week", "Next 7 days"], ["month", "Next 30 days"], ["later", "Later / no date"]];

function inQueue(o: OpenItem, q: Queue, today: string) {
  if (q === "all") return true;
  if (q === "overdue") return o.status === "overdue";
  if (!o.iso) return q === "later";
  if (o.iso < today) return false;
  if (q === "week") return o.iso <= addDays(today, 7);
  if (q === "month") return o.iso <= addDays(today, 30);
  return o.iso > addDays(today, 30);
}

function ToCollect({ open, today, owing, cards, viewer, queue, setQueue, onRepay }: {
  open: OpenItem[]; today: string; owing: Profile[]; cards: FinanceData["cards"]; viewer: boolean; queue: Queue; setQueue: (q: Queue) => void; onRepay: (id: string) => void;
}) {
  const buckets = useMemo(() => aging(open, today), [open, today]);
  const [band, setBand] = useState<AgingKey | null>(null);
  const owedAll = sumBy(buckets, (b) => b.amount);
  const items = open
    .filter((o) => (band ? agingKey(o.iso, today) === band : inQueue(o, queue, today)))
    .sort((a, b) => (a.iso ?? "9999").localeCompare(b.iso ?? "9999") || b.left - a.left);
  const maxOwes = Math.max(1, ...owing.map((p) => p.owes));
  const pick = (q: Queue) => { setBand(null); setQueue(q); };

  return (
    <>
      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
          <div>
            <h2 className="m-0 text-[16px] font-semibold">How late the money is</h2>
            <div className="mt-0.5 text-[13px] text-slate-500">Everything still owed, by how far past its due date it is. Click a band to list just that.</div>
          </div>
          <span className="money text-[18px]">{taka(owedAll)}</span>
        </div>
        <div aria-hidden="true" className="mx-4 flex h-5 gap-[3px] overflow-hidden rounded-full bg-soft sm:mx-5">
          {buckets.filter((b) => b.amount > 0).map((b, i) => (
            <button key={b.key} type="button" tabIndex={-1} onClick={() => setBand(band === b.key ? null : b.key)} title={`${b.label}: ${taka(b.amount)}`}
              className={`bar-fill h-full transition-[filter,opacity] first:rounded-l-full last:rounded-r-full hover:brightness-110 ${band && band !== b.key ? "opacity-35" : ""}`}
              style={{ width: `${(b.amount / (owedAll || 1)) * 100}%`, background: AGING_COLOR[b.key], animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-4 sm:p-5 md:grid-cols-3 xl:grid-cols-6">
          {buckets.map((b, i) => (
            <li key={b.key} style={stagger(i, 60)} className="animate-fade-up">
              <button type="button" disabled={!b.amount} aria-pressed={band === b.key} onClick={() => setBand(band === b.key ? null : b.key)}
                className={`lift flex h-full w-full flex-col gap-1 rounded-xl border p-3 text-left transition-colors enabled:hover:bg-subtle disabled:opacity-50 ${band === b.key ? "border-ink bg-subtle" : "border-line"}`}>
                <span className="flex items-center gap-2 text-[12px] font-medium text-slate-600"><span aria-hidden="true" className="size-2.5 flex-none rounded-full" style={{ background: AGING_COLOR[b.key] }} />{b.label}</span>
                <span className="money text-[17px]">{taka(b.amount)}</span>
                <span className="text-[11.5px] text-slate-500">{plural(b.people, "person", "people")}{owedAll ? ` · ${Math.round((b.amount / owedAll) * 100)}%` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section aria-labelledby="q-h" className="surface-card overflow-hidden">
          <div className="flex flex-col gap-3 px-4 pb-3 pt-4 sm:px-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="q-h" className="m-0 text-[16px] font-semibold">Collection queue</h2>
                <div className="mt-0.5 text-[13px] text-slate-500">Each installment still owed, soonest due first.</div>
              </div>
              <span className="text-[13px] text-slate-500">{plural(items.length, "item")} · <Money value={sumBy(items, (o) => o.left)} tone="owed" /></span>
            </div>
            <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
              {QUEUES.map(([k, l]) => {
                const on = !band && queue === k;
                const n = open.filter((o) => inQueue(o, k, today)).length;
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => pick(k)}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-[background-color,color,transform] active:scale-95 ${on ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-slate-600 hover:border-line-strong hover:text-ink"}`}>
                    {l}<span className={`tabular-nums ${on ? "text-on-ink/70" : "text-slate-400"}`}>{n}</span>
                  </button>
                );
              })}
              {band && (
                <span className="inline-flex animate-pop-in items-center gap-1 rounded-full border border-line-strong bg-surface py-0.5 pl-3 pr-1 text-[12.5px] font-medium">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ background: AGING_COLOR[band] }} />{buckets.find((b) => b.key === band)?.label}
                  <button type="button" onClick={() => setBand(null)} aria-label="Remove this filter" className="grid size-7 place-items-center rounded-full text-slate-400 hover:bg-soft hover:text-ink"><CloseIcon size={12} /></button>
                </span>
              )}
            </div>
          </div>
          {items.length ? (
            <ul key={`${queue}|${band}`} className="m-0 max-h-[560px] list-none overflow-y-auto border-t border-line p-0">
              {items.map((o, i) => (
                <li key={o.key} style={stagger(i, 30, 360)} className="group/row relative flex animate-fade-up items-center gap-3 border-b border-soft px-4 py-2.5 transition-colors last:border-0 hover:bg-subtle sm:px-5">
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] origin-top scale-y-0 transition-transform duration-300 group-hover/row:scale-y-100" style={{ background: AGING_COLOR[agingKey(o.iso, today)] }} />
                  <DateChip iso={o.iso} today={today} size="sm" />
                  <Avatar text={initials(o.name)} size={30} />
                  <span className="min-w-0 flex-auto">
                    <Link href={`/debtors/${o.personId}`} className="block truncate text-[14px] font-medium hover:text-brand-ink hover:underline">{o.name}</Link>
                    <span className="block truncate text-[12px] text-slate-500">{o.source === "loan" ? "Bank loan" : cardLabel(cards.find((c) => c.id === o.cardId))}{o.emi ? " · EMI installment" : ""}</span>
                  </span>
                  <Money value={o.left} tone={o.status === "overdue" ? "bad" : "owed"} className="text-[14.5px]" />
                  {!viewer && <Button size="sm" variant="secondary" onClick={() => onRepay(o.personId)} aria-label={`Record a repayment from ${o.name}`}>Record</Button>}
                </li>
              ))}
            </ul>
          ) : <div className="border-t border-line p-5"><EmptyState compact title="Nothing here" icon={<CheckIcon size={18} />}>Nothing is owed in this group.</EmptyState></div>}
        </section>

        <section aria-labelledby="who-h" className="surface-card overflow-hidden">
          <div className="px-4 pb-3 pt-4 sm:px-5">
            <h2 id="who-h" className="m-0 text-[16px] font-semibold">Who owes the most</h2>
            <div className="mt-0.5 text-[13px] text-slate-500">The bar is what they owe; the ring is how much they&apos;ve repaid.</div>
          </div>
          {owing.length ? (
            <ol className="m-0 list-none border-t border-line p-0">
              {owing.map((p, i) => (
                <li key={p.id} style={stagger(i, 40)} className="group/row relative animate-fade-up border-b border-soft transition-colors last:border-0 hover:bg-subtle">
                  <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <span className="w-5 flex-none text-right text-[12px] tabular-nums text-slate-400">{i + 1}</span>
                    <Ring pct={p.pct} size={40} stroke={3} color={p.dueKind === "late" ? "var(--color-bad)" : "var(--color-brand-2)"}><Avatar text={p.initials} size={32} /></Ring>
                    <span className="min-w-0 flex-auto">
                      <span className="flex items-baseline justify-between gap-2">
                        <Link href={`/debtors/${p.id}`} className="truncate text-[14px] font-medium after:absolute after:inset-0 hover:text-brand-ink">{p.name}</Link>
                        <Money value={p.owes} tone={p.dueKind === "late" ? "bad" : "owed"} className="flex-none text-[14px]" />
                      </span>
                      <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-soft">
                        <span className={`bar-fill block h-full rounded-full ${p.dueKind === "late" ? "bg-bad/75" : "bg-owed-bar"}`} style={{ width: `${(p.owes / maxOwes) * 100}%`, animationDelay: `${i * 50 + 120}ms` }} />
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">{p.pct}% repaid · {p.due ? `${p.dueKind === "late" ? "overdue since" : "next"} ${dateShort(p.due)}` : "no due date"}</span>
                    </span>
                    {!viewer && <Button size="sm" variant="secondary" onClick={() => onRepay(p.id)} className="relative z-10" aria-label={`Record a repayment from ${p.name}`}>Record</Button>}
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className="border-t border-line p-5"><EmptyState compact title="Nobody owes you">Everything lent has been repaid.</EmptyState></div>}
        </section>
      </div>
    </>
  );
}

// ---- Collected ----------------------------------------------------------------------------------------------------

const PAGE = 40;

function Collected({ data, today }: { data: FinanceData; today: string }) {
  const [f, setF] = useState<RepFilter>({});
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);
  const [limit, setLimit] = useState(PAGE);
  const set = (patch: Partial<RepFilter>) => { setF((x) => ({ ...x, ...patch })); setLimit(PAGE); };

  const reps = useMemo(() => data.repayments.filter((r) => r.paid_on <= today), [data.repayments, today]);
  const months = useMemo(() => collectionMonths(reps, today, 12), [reps, today]);
  const days = useMemo(() => collectionDays(reps, today), [reps, today]);
  const name = useMemo(() => new Map(data.people.map((p) => [p.id, p.name])), [data.people]);
  const target = (r: Repayment) => (r.applies_to === "loan" ? "Bank loans" : cardLabel(data.cards.find((c) => c.id === r.card_id)));
  const text = (r: Repayment) => `${name.get(r.person_id) ?? ""} ${target(r)} ${dateLong(r.paid_on)}`;

  // The charts follow the period (month or day) only; the list follows every filter, so a slice never empties its own chart.
  const period = useMemo(() => filterRepayments(reps, { month: f.month, day: f.day }), [reps, f.month, f.day]);
  const list = filterRepayments(reps, { ...f, q: query }, text)
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at));
  const total = sumBy(list, (r) => r.amount);
  const allTotal = sumBy(reps, (r) => r.amount);

  const methods = breakdown(period, (r) => r.via || "Other", (r) => r.amount);
  const targets = breakdown(period, (r) => (r.applies_to === "loan" ? "loan" : r.card_id ?? "card"), (r) => r.amount);
  const bank = breakdown(period, (r) => (r.account_id ? "yes" : "no"), (r) => r.amount);
  const who = payers(period).slice(0, 8);
  const maxWho = Math.max(1, ...who.map((w) => w.total));
  const label = (k: string) => (k === "loan" ? "Bank loans" : cardLabel(data.cards.find((c) => c.id === k)));
  const periodText = f.day ? dateLong(f.day) : f.month ? monthLabel(f.month) : "All time";

  const chips: { key: keyof RepFilter; text: string }[] = [
    ...(f.month ? [{ key: "month" as const, text: monthLabel(f.month) }] : []),
    ...(f.day ? [{ key: "day" as const, text: dateLong(f.day) }] : []),
    ...(f.via ? [{ key: "via" as const, text: f.via }] : []),
    ...(f.to ? [{ key: "to" as const, text: label(f.to) }] : []),
    ...(f.bank ? [{ key: "bank" as const, text: f.bank === "yes" ? "Into the bank" : "Not into the bank" }] : []),
  ];

  if (!reps.length) {
    return <section className="surface-card p-5"><EmptyState title="No repayments yet" icon={<InIcon size={18} />}>When someone pays you back, it shows up here with charts of how and when.</EmptyState></section>;
  }

  return (
    <>
      <section className="surface-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="m-0 text-[16px] font-semibold">Collected, month by month</h2>
            <div className="mt-0.5 text-[13px] text-slate-500">The last 12 months, split by whether the money went into the bank. Click a month to filter everything below.</div>
          </div>
          <span className="text-[13px] text-slate-500">All time <Money value={allTotal} tone="good" /></span>
        </div>
        <CollectBars months={months} selected={f.month} onSelect={(k) => set({ month: f.month === k ? undefined : k, day: undefined })} />
      </section>

      <section className="surface-card p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="m-0 text-[16px] font-semibold">Day by day</h2>
          <div className="mt-0.5 text-[13px] text-slate-500">The last 26 weeks. Deeper colour means more came in; click a day to see its payments.</div>
        </div>
        <CalendarHeat days={days} end={today} weeks={26} today={today} selected={f.day} onPick={(iso) => set({ day: f.day === iso ? undefined : iso, month: undefined })}
          words={{ title: "Money collected", item: ["payment", "payments"], none: "nothing collected", summary: (n, w) => `${n} days with a repayment in the last ${w} weeks. Click one.` }} />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="surface-card p-4 sm:p-5">
          <h2 className="m-0 text-[16px] font-semibold">How it was paid</h2>
          <p className="m-0 mb-4 mt-0.5 text-[13px] text-slate-500">{periodText}. Click one to list those payments.</p>
          {methods.length ? <Donut title="Repayments by method" centerLabel="Collected" size={170} picked={f.via}
            slices={methods.map((m, i) => ({ name: m.name, value: m.total, color: HUES[i % HUES.length], sub: plural(m.count, "payment") }))}
            onPick={(v) => set({ via: f.via === v ? undefined : v })} /> : <EmptyState compact title="Nothing in this period" />}
        </section>
        <section className="surface-card p-4 sm:p-5">
          <h2 className="m-0 text-[16px] font-semibold">What it paid off</h2>
          <p className="m-0 mb-4 mt-0.5 text-[13px] text-slate-500">Bank loans and each card are kept apart.</p>
          {targets.length ? <Donut title="Repayments by what they paid off" centerLabel="Collected" size={170} picked={f.to ? label(f.to) : undefined}
            slices={targets.map((t, i) => ({ name: label(t.name), value: t.total, color: t.name === "loan" ? "var(--color-owed-bar)" : i % 2 ? "#2F5583" : "#B98E81", sub: plural(t.count, "payment") }))}
            onPick={(n) => { const k = targets.find((t) => label(t.name) === n)?.name; if (k) set({ to: f.to === k ? undefined : k }); }} /> : <EmptyState compact title="Nothing in this period" />}
        </section>
        <section className="surface-card p-4 sm:p-5">
          <h2 className="m-0 text-[16px] font-semibold">Where the money went</h2>
          <p className="m-0 mb-4 mt-0.5 text-[13px] text-slate-500">Paid into the bank account, or kept as cash or another wallet.</p>
          {bank.length ? <Donut title="Repayments by whether they went into the bank" centerLabel="Collected" size={170}
            picked={f.bank ? (f.bank === "yes" ? "Into the bank" : "Not into the bank") : undefined}
            slices={bank.map((b) => ({ name: b.name === "yes" ? "Into the bank" : "Not into the bank", value: b.total, color: b.name === "yes" ? BANK : CASH, sub: plural(b.count, "payment") }))}
            onPick={(n) => { const k = n === "Into the bank" ? "yes" : "no"; set({ bank: f.bank === k ? undefined : k }); }} /> : <EmptyState compact title="Nothing in this period" />}
        </section>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <section className="surface-card overflow-hidden">
          <div className="px-4 pb-3 pt-4 sm:px-5">
            <h2 className="m-0 text-[16px] font-semibold">Who paid back</h2>
            <div className="mt-0.5 text-[13px] text-slate-500">{periodText}, most first. Click to open their profile.</div>
          </div>
          {who.length ? (
            <ol key={`${f.month}|${f.day}`} className="m-0 list-none border-t border-line p-0">
              {who.map((w, i) => {
                const nm = name.get(w.id) ?? "Unknown";
                return (
                  <li key={w.id} style={stagger(i, 45)} className="animate-fade-up border-b border-soft last:border-0">
                    <Link href={`/debtors/${w.id}`} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-subtle sm:px-5">
                      <span className="transition-transform duration-300 ease-[var(--ease-spring)] group-hover:scale-110"><Avatar text={initials(nm)} size={32} /></span>
                      <span className="min-w-0 flex-auto">
                        <span className="flex items-baseline justify-between gap-2"><span className="truncate text-[14px] font-medium group-hover:text-brand-ink">{nm}</span><Money value={w.total} tone="good" className="flex-none text-[14px]" /></span>
                        <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-soft">
                          <span className="bar-fill block h-full rounded-full bg-gradient-to-r from-brand-2 to-[#3DAA80]" style={{ width: `${(w.total / maxWho) * 100}%`, animationDelay: `${i * 60 + 120}ms` }} />
                        </span>
                        <span className="mt-0.5 block text-[11.5px] text-slate-500">{plural(w.count, "payment")} · last {dateShort(w.last)}</span>
                      </span>
                      <ChevronRight size={15} className="flex-none text-slate-400 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : <p className="m-0 border-t border-line p-5 text-[13px] text-slate-500">Nobody paid in this period.</p>}
        </section>

        <section aria-labelledby="pay-h" className="surface-card overflow-hidden">
          <div className="flex flex-col gap-3 px-4 pb-3 pt-4 sm:px-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="pay-h" className="m-0 text-[16px] font-semibold">Payments</h2>
                <div className="mt-0.5 text-[13px] text-slate-500">Newest first. The charts above filter this list.</div>
              </div>
              <span aria-live="polite" className="text-[13px] text-slate-500">{plural(list.length, "payment")} · <Money value={total} tone="good" /></span>
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:border-brand-2">
              <SearchIcon size={16} className="text-slate-500" /><span className="sr-only">Search payments</span>
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search name, method, card, date or amount" className="min-w-0 flex-auto bg-transparent text-[14.5px] outline-none" />
              {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="grid size-7 animate-pop-in place-items-center rounded-md text-slate-400 hover:bg-soft hover:text-ink"><CloseIcon size={14} /></button>}
            </label>
            {chips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {chips.map((c) => (
                  <span key={c.key} className="inline-flex animate-pop-in items-center gap-1 rounded-full border border-line-strong bg-surface py-0.5 pl-3 pr-1 text-[12.5px] font-medium">
                    {c.text}
                    <button type="button" onClick={() => set({ [c.key]: undefined })} aria-label={`Remove filter: ${c.text}`} className="grid size-7 place-items-center rounded-full text-slate-400 hover:bg-soft hover:text-ink"><CloseIcon size={12} /></button>
                  </span>
                ))}
                <button type="button" onClick={() => { setF({}); setQ(""); setLimit(PAGE); }} className="min-h-9 rounded-full px-3 text-[12.5px] font-medium text-slate-500 hover:text-ink">Clear all</button>
              </div>
            )}
          </div>
          {list.length ? (
            <>
              <ul key={JSON.stringify(f) + query} className="m-0 list-none border-t border-line p-0">
                {list.slice(0, limit).map((r, i) => {
                  const nm = name.get(r.person_id) ?? "Unknown";
                  return (
                    <li key={r.id} style={stagger(i, 25, 300)} className="flex animate-fade-up items-center gap-3 border-b border-soft px-4 py-2.5 transition-colors last:border-0 hover:bg-subtle sm:px-5">
                      <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${r.account_id ? BANK : CASH} 14%, transparent)`, color: r.account_id ? BANK : CASH }}>
                        {r.account_id ? <BankIcon size={16} /> : <InIcon size={16} />}
                      </span>
                      <span className="min-w-0 flex-auto">
                        <Link href={`/debtors/${r.person_id}`} className="block truncate text-[14px] font-medium hover:text-brand-ink hover:underline"><Mark text={nm} q={query} /></Link>
                        <span className="block truncate text-[12px] text-slate-500">
                          {dateLong(r.paid_on)} · <Mark text={r.via} q={query} /> · <Mark text={target(r)} q={query} />{r.account_id ? " · into the bank" : ""}
                        </span>
                      </span>
                      <Money value={r.amount} tone="good" signed className="text-[14.5px]" />
                    </li>
                  );
                })}
              </ul>
              {list.length > limit && (
                <div className="border-t border-line p-3 text-center">
                  <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, list.length - limit)} more of {list.length - limit}</Button>
                </div>
              )}
            </>
          ) : (
            <div className="border-t border-line p-5">
              <EmptyState compact title="No payments match" action={<Button variant="secondary" size="sm" onClick={() => { setF({}); setQ(""); }}>Clear search and filters</Button>}>Try another word or remove a filter.</EmptyState>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * Stacked monthly columns: into the bank (green) under not into the bank (blue). Hover or ←/→ to read a month;
 * click or Enter selects it (click again to clear). A hidden table carries the same figures for screen readers.
 */
function CollectBars({ months, selected, onSelect }: { months: CollectMonth[]; selected?: string; onSelect: (key: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = months.length;
  const max = Math.max(1, ...months.map((m) => m.total));
  const avg = sumBy(months, (m) => m.total) / Math.max(n, 1);
  const sel = months.findIndex((m) => m.key === selected);
  const i = hover ?? (sel >= 0 ? sel : n - 1);
  const cur = months[i];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover(Math.max(0, i - 1)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setHover(Math.min(n - 1, i + 1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(cur.key); }
  };
  return (
    <figure className="m-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12.5px] text-slate-600">
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: BANK }} />Into the bank</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: CASH }} />Cash &amp; other</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-4 border-t border-dashed border-slate-500" />12-month average</span>
        </span>
        <span aria-live="polite" className="text-slate-500">
          <b className="font-semibold text-ink">{monthLabel(cur.key)}</b> · <Money value={cur.total} tone="good" /> · {plural(cur.count, "payment")}
          {cur.total > 0 && <> · {Math.round((cur.intoBank / cur.total) * 100)}% into the bank</>}
        </span>
      </div>
      <div tabIndex={0} role="group" aria-label="Money collected each month for the last 12 months. Use the arrow keys to read a month and Enter to filter by it." aria-describedby="cb-t"
        onKeyDown={onKey} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}
        className="relative grid h-[220px] items-end gap-1.5 rounded-lg outline-offset-4 sm:gap-2.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {[0.25, 0.5, 0.75].map((g) => <span key={g} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${g * 100}%` }} />)}
        {avg > 0 && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-slate-500/60" style={{ bottom: `${(avg / max) * 100}%` }} />}
        {months.map((m, k) => {
          const on = k === i, picked = k === sel;
          return (
            <button key={m.key} type="button" tabIndex={-1} onPointerEnter={() => setHover(k)} onClick={() => onSelect(m.key)}
              aria-label={`${monthLabel(m.key)}: ${taka(m.total)}`}
              className={`relative flex h-full flex-col justify-end rounded-lg px-[12%] transition-colors ${picked ? "bg-good-tint" : on ? "bg-subtle" : ""}`}>
              {on && m.total > 0 && <span className="absolute inset-x-0 animate-pop-in text-center text-[10.5px] font-semibold tabular-nums text-ink" style={{ bottom: `calc(${(m.total / max) * 100}% + 4px)` }}>{taka(m.total)}</span>}
              <span className={`viz-grow flex w-full flex-col-reverse overflow-hidden rounded-t-md transition-[filter,opacity] duration-200 ${hover != null && !on ? "opacity-50" : ""} ${on ? "brightness-110" : ""}`}
                style={{ height: `${Math.max((m.total / max) * 100, m.total ? 2 : 0.8)}%`, animationDelay: `${k * 50}ms`, background: m.total ? undefined : "var(--color-soft)" }}>
                {m.total > 0 && <span style={{ height: `${(m.intoBank / m.total) * 100}%`, background: BANK }} />}
                {m.total > 0 && <span className="flex-auto" style={{ background: CASH }} />}
              </span>
            </button>
          );
        })}
      </div>
      <div aria-hidden="true" className="grid gap-1.5 text-[10.5px] text-slate-500 sm:gap-2.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {months.map((m, k) => <span key={m.key} className={`text-center tabular-nums ${k === i ? "font-semibold text-ink" : ""}`}>{monthLabel(m.key).split(" ")[0]}{m.key.endsWith("-01") || k === 0 ? ` ’${m.key.slice(2, 4)}` : ""}</span>)}
      </div>
      <table id="cb-t" className="sr-only">
        <caption>Money collected by month</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">Total</th><th scope="col">Into the bank</th><th scope="col">Cash and other</th><th scope="col">Payments</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.key}><th scope="row">{monthLabel(m.key)}</th><td>{taka(m.total)}</td><td>{taka(m.intoBank)}</td><td>{taka(m.other)}</td><td>{m.count}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

// ---- Data checks --------------------------------------------------------------------------------------------------

function Checks({ anomalies }: { anomalies: Anomaly[] }) {
  const [sev, setSev] = useState<Anomaly["severity"] | "all">("all");
  const count = (s: Anomaly["severity"]) => anomalies.filter((a) => a.severity === s).length;
  const shown = anomalies.filter((a) => sev === "all" || a.severity === sev);
  const kinds = breakdown(anomalies, (a) => a.kind, () => 1);

  if (!anomalies.length) {
    return (
      <section className="surface-card p-6">
        <EmptyState title="No issues found" icon={<CheckIcon size={18} />}>No duplicates, overpayments, date problems or missing due dates. These checks only point things out — nothing is ever changed or deleted.</EmptyState>
      </section>
    );
  }
  return (
    <section aria-labelledby="chk-h" className="surface-card overflow-hidden">
      <div className="flex flex-col gap-4 px-4 pb-4 pt-4 sm:px-5">
        <div>
          <h2 id="chk-h" className="m-0 text-[16px] font-semibold">Data checks</h2>
          <div className="mt-0.5 text-[13px] text-slate-500">Deterministic checks on your records. They only point things out — nothing is changed or deleted.</div>
        </div>
        <div aria-hidden="true" className="flex h-3 gap-[3px] overflow-hidden rounded-full bg-soft">
          {(["high", "medium", "low"] as const).filter((s) => count(s)).map((s, i) => (
            <span key={s} className="bar-fill h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(count(s) / anomalies.length) * 100}%`, background: SEV[s].color, animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Severity" className="flex flex-wrap gap-1.5">
            {([["all", "All", anomalies.length], ["high", "High", count("high")], ["medium", "Medium", count("medium")], ["low", "Low", count("low")]] as const).map(([k, l, n]) => (
              <button key={k} type="button" aria-pressed={sev === k} disabled={!n} onClick={() => setSev(k)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-[background-color,color,transform] active:scale-95 disabled:opacity-40 ${sev === k ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-slate-600 hover:border-line-strong hover:text-ink"}`}>
                {k !== "all" && <span aria-hidden="true" className="size-2 rounded-full" style={{ background: SEV[k].color }} />}{l}<span className={`tabular-nums ${sev === k ? "text-on-ink/70" : "text-slate-400"}`}>{n}</span>
              </button>
            ))}
          </div>
          <span className="text-[12px] text-slate-500">{kinds.map((k) => `${k.count} ${k.name}`).join(" · ")}</span>
        </div>
      </div>
      <ul key={sev} className="m-0 list-none border-t border-line p-0">
        {shown.map((a, i) => {
          const s = SEV[a.severity];
          const body = (
            <>
              <span aria-hidden="true" className="mt-0.5 grid size-8 flex-none place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${s.color} 14%, transparent)`, color: s.color }}>
                {a.severity === "low" ? <InfoIcon size={16} /> : <AlertIcon size={16} />}
              </span>
              <span className="min-w-0 flex-auto">
                <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">{a.title}<Badge tone={s.tone} className="text-[10.5px]">{s.label} · {a.kind}</Badge></span>
                <span className="block text-[12.5px] text-slate-500">{a.detail}</span>
              </span>
              {a.href && <ChevronRight size={15} className="mt-1.5 flex-none text-slate-400 transition-transform group-hover:translate-x-0.5" />}
            </>
          );
          return (
            <li key={a.id} style={stagger(i, 35)} className="animate-fade-up border-b border-soft last:border-0">
              {a.href ? <Link href={a.href} className="group flex gap-3 px-4 py-3 transition-colors hover:bg-subtle sm:px-5">{body}</Link> : <div className="flex gap-3 px-4 py-3 sm:px-5">{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
