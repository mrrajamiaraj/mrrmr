"use client";

// People & loans. Three views over the same tested figures (lib/ledger profiles, lib/dashboard open items,
// lib/trends monthly series, lib/statement balances, lib/people-stats groupings):
//   People   — the list (or cards), filtered by status, search, or a lateness bucket picked on Insights;
//   Insights — lent vs repaid by month with what's owed drawn over it, how late the money is, who owes what,
//              where it's owed and what it was lent for — every chart is clickable;
//   Due      — a calendar of what falls due, past and coming; pick a day to see and record it.
// Charts are hand-built SVG (components/research-viz, components/viz); motion stops for prefers-reduced-motion.

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell, useViewer } from "@/components/shell";
import { BankIcon, ChevronRight, CloseIcon, DownloadIcon, DueIcon, EyeIcon, HistoryIcon, PeopleIcon, PersonIcon, SearchIcon, TrendIcon } from "@/components/icons";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { ExportPdfDialog, RepayDialog } from "@/components/debtors/person-dialogs";
import { repayTargets } from "@/components/debtors/repay-form";
import { Avatar, Flash } from "@/components/debtors/bits";
import { Badge, Button, EmptyState, Money } from "@/components/ui";
import { usePalettePeople } from "@/components/command-palette";
import { CountUp, stagger } from "@/components/motion";
import { DateChip, HUES, Ring, SplitBar } from "@/components/viz";
import { CalendarHeat, Donut, FlowChart, Mark, PillTabs, RaceChart, Sparkline, type FlowLabels } from "@/components/research-viz";
import { buildProfiles, cardLabel, type Profile } from "@/lib/ledger";
import { computeDashboard } from "@/lib/dashboard";
import { monthlySeries } from "@/lib/trends";
import { buildStatement } from "@/lib/statement";
import { cumulative } from "@/lib/research-stats";
import { aging, agingKey, dueCalendar, lendingMonths, lentFor, type AgingKey } from "@/lib/people-stats";
import { addDays, dateLong, taka } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { FinanceData } from "@/lib/types";

export type Filter = "all" | "owing" | "overdue" | "soon" | "repaid";
type Sort = "owes" | "due" | "name" | "recent";
type View = "people" | "insights" | "due";

/** One word for where someone stands; always text, never colour alone. */
function standing(p: Profile): { label: string; tone: "bad" | "owed" | "good" | "muted" } {
  if (p.owes <= 0) return { label: p.txCount ? "Repaid" : "No entries", tone: p.txCount ? "good" : "muted" };
  if (p.dueKind === "late") return { label: "Overdue", tone: "bad" };
  if (p.dueKind === "soon") return { label: "Due soon", tone: "owed" };
  return { label: p.paid > 0 ? "Part repaid" : "Owes", tone: "owed" };
}
const match = (p: Profile, f: Filter) =>
  f === "all" || (f === "repaid" ? p.owes <= 0 : p.owes > 0 && (f === "owing" || (f === "overdue" ? p.dueKind === "late" : p.dueKind === "soon")));

const LENDING_LABELS: FlowLabels = {
  a: "Lent out", b: "Paid back", line: "Owed at month end", lineNote: "Owed to you at each month end", net: "Paid back − lent",
  count: null, colors: { a: "var(--color-owed-bar)", b: "var(--color-chart-in)", line: "var(--color-info)" },
};
const AGING_COLOR: Record<AgingKey, string> = {
  late60: "#8E2A20", late30: "#B8452F", late1: "#D9774F", week: "#C79A3A", later: "#3F9A75", undated: "#8A8F98",
};

const monthsSince = (iso: string, today: string) =>
  (Number(today.slice(0, 4)) - Number(iso.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(iso.slice(5, 7)) + 1;

export function DebtorsView({ data, today, initialFilter = "all" }: { data: FinanceData; today: string; initialFilter?: Filter }) {
  const viewer = useViewer();
  const router = useRouter();
  const [view, setView] = useState<View>("people");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [bucket, setBucket] = useState<AgingKey | null>(null);
  const [sort, setSort] = useState<Sort>("owes");
  const [layout, setLayout] = useState<"list" | "cards">("list");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const [adding, setAdding] = useState(false);
  const [repaying, setRepaying] = useState<Profile | null>(null);
  const [exporting, setExporting] = useState(false);
  const [flash, setFlash] = useState("");

  const all = useMemo(() => buildProfiles(data, today), [data, today]);
  const d = useMemo(() => computeDashboard(data, today), [data, today]);
  usePalettePeople(all, (id) => id && router.push(`/debtors/${id}`));
  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;

  // Charts: last 12 months for the bars; full history (≤ 36 months) for the lent-vs-repaid race.
  const first = useMemo(() => [...data.loans.map((l) => l.taken_on), ...data.cardUses.filter((u) => u.person_id).map((u) => u.used_on), ...data.repayments.map((r) => r.paid_on)].sort()[0], [data]);
  const year = useMemo(() => lendingMonths(monthlySeries(data, today, 12)), [data, today]);
  const race = useMemo(() => cumulative(lendingMonths(monthlySeries(data, today, Math.min(36, Math.max(2, first ? monthsSince(first, today) : 2))))), [data, today, first]);
  const buckets = useMemo(() => aging(d.open, today), [d.open, today]);
  const bucketsOf = useMemo(() => {
    const m = new Map<string, Set<AgingKey>>();
    for (const o of d.open) m.set(o.personId, (m.get(o.personId) ?? new Set()).add(agingKey(o.iso, today)));
    return m;
  }, [d.open, today]);
  const balances = useMemo(() => new Map(all.map((p) => [p.id, buildStatement(data, p.id, today, { from: null, to: null })?.rows.map((r) => Math.max(r.balance, 0)) ?? []])), [all, data, today]);

  const people = useMemo(() => all
    .filter((p) => match(p, filter) && (!bucket || bucketsOf.get(p.id)?.has(bucket)))
    .filter((p) => !query || `${p.name} ${p.relation ?? ""} ${p.phone ?? ""} ${p.notes ?? ""} ${p.reasons.join(" ")}`.toLowerCase().includes(query))
    .sort((a, b) =>
      sort === "due" ? (a.owes > 0 && a.due ? a.due : "9999").localeCompare(b.owes > 0 && b.due ? b.due : "9999") || b.owes - a.owes
      : sort === "name" ? a.name.localeCompare(b.name)
      : sort === "recent" ? (b.lastIso ?? "").localeCompare(a.lastIso ?? "")
      : b.owes - a.owes || a.name.localeCompare(b.name)), [all, filter, bucket, bucketsOf, query, sort]);

  const count = (f: Filter) => all.filter((p) => match(p, f)).length;
  const owing = all.filter((p) => p.owes > 0);
  const overdue = owing.filter((p) => p.dueKind === "late");
  const soon = owing.filter((p) => p.dueKind === "soon");
  const owedTotal = sumBy(owing, (p) => p.owes);
  const takenTotal = sumBy(all, (p) => p.taken);
  const paidTotal = sumBy(all, (p) => p.paid);
  const pctRepaid = takenTotal ? Math.min(100, (paidTotal / takenTotal) * 100) : 0;
  const datedDue = d.open.filter((o) => o.iso).length;

  const show = (f: Filter) => { setFilter(f); setBucket(null); setView("people"); };
  const chips: [Filter, string][] = [["all", "All"], ["owing", "Owe you"], ["overdue", "Overdue"], ["soon", "Due in 7 days"], ["repaid", "Repaid"]];

  const hero = (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-[720px]">
          <div className="eyebrow flex items-center gap-2">
            <PeopleIcon size={14} className="text-brand-2" />Lending
            {viewer && <Badge tone="info" className="ml-1 normal-case tracking-normal"><EyeIcon size={12} />View only</Badge>}
          </div>
          <h1 className="m-0 mt-2 font-display text-title font-normal text-ink">People &amp; loans</h1>
          <p className="m-0 mt-2 text-[14.5px] text-slate-500">Everyone who owes you money — bank loans and purchases on your cards — and what they&apos;ve paid back.</p>
        </div>
        {!viewer && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="secondary" onClick={() => setExporting(true)} className="flex-auto sm:flex-none"><DownloadIcon size={15} />Export all (PDF)</Button>
            <Button onClick={() => setAdding(true)} className="shine flex-auto sm:flex-none"><PersonIcon size={15} />Add loan</Button>
          </div>
        )}
      </div>

      <section aria-label="Lending at a glance" className="deck grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-5">
            <div className="relative grid size-[118px] flex-none place-items-center">
              <span aria-hidden="true" className="viz-breathe absolute inset-2 rounded-full bg-[radial-gradient(closest-side,rgba(232,194,122,0.32),transparent)]" />
              <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden="true">
                <defs><linearGradient id="pp-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7DD4B8" /><stop offset="1" stopColor="#92B5E8" /></linearGradient></defs>
                <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="9" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="url(#pp-ring)" strokeWidth="9" strokeLinecap="round" pathLength={100} strokeDasharray="100"
                  className="viz-sweep" style={{ ["--to" as string]: 100 - pctRepaid }} />
              </svg>
              <span className="relative flex flex-col items-center text-white">
                <span className="money text-[24px] leading-none"><CountUp value={Math.round(pctRepaid)} format={(n) => `${Math.round(n)}%`} duration={1400} intro /></span>
                <span className="mt-1 text-[10.5px] uppercase tracking-[0.1em] text-white/55">repaid</span>
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/60">Owed to you now</span>
              <span className="money text-[clamp(36px,5.5vw,56px)] font-medium leading-none tracking-[-0.03em] text-[#F0C77E]">
                <CountUp value={owedTotal} format={taka} duration={1400} intro />
              </span>
              <span className="text-[12.5px] text-white/55">{owing.length} {owing.length === 1 ? "person owes" : "people owe"} you · {taka(paidTotal)} paid back of {taka(takenTotal)} lent</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={() => show("owing")} className="deck-tile flex flex-col gap-1 p-4 text-left transition-colors">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55"><BankIcon size={13} className="text-[#E8C27A]" />Bank loans</span>
              <span className="money text-[20px] leading-tight text-white"><CountUp value={d.receivables.bankLoans} format={taka} duration={1300} intro /></span>
              <span className="text-[12px] text-white/55">cards {taka(d.receivables.cards)}</span>
              <Sparkline values={year.map((m) => m.running)} color="#E8C27A" width={140} height={26} className="mt-1 w-full max-w-[140px]" />
            </button>
            <button type="button" onClick={() => show("overdue")} className="deck-tile flex flex-col gap-1 p-4 text-left transition-colors">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55"><DueIcon size={13} className="text-[#FFA08F]" />Overdue</span>
              <span className={`money text-[20px] leading-tight ${d.overdue.amount ? "text-[#FFA08F]" : "text-white"}`}><CountUp value={d.overdue.amount} format={taka} duration={1300} intro /></span>
              <span className="text-[12px] text-white/55">{overdue.length ? `${overdue.length} ${overdue.length === 1 ? "person" : "people"} late` : "Nobody is late"}</span>
              <span aria-hidden="true" className="mt-1.5 flex -space-x-2">{overdue.slice(0, 5).map((p) => <span key={p.id} className="grid size-6 place-items-center rounded-full border border-white/20 bg-[#7F2920] text-[9.5px] font-bold text-white">{p.initials}</span>)}</span>
            </button>
            <button type="button" onClick={() => show("soon")} className="deck-tile flex flex-col gap-1 p-4 text-left transition-colors">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55"><TrendIcon size={13} className="text-[#7DD4B8]" />Due in 7 days</span>
              <span className="money text-[20px] leading-tight text-white"><CountUp value={d.dueWeek.amount} format={taka} duration={1300} intro /></span>
              <span className="text-[12px] text-white/55">{soon.length ? `${soon.length} ${soon.length === 1 ? "person" : "people"}` : "Nothing due this week"}</span>
              <WeekStrip today={today} dues={d.open.filter((o) => o.iso && o.iso >= today).map((o) => o.iso!)} dark />
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center">
          {race.length ? <RaceChart points={race} labels={{ a: "Repaid", b: "Lent", short: "still owed", ahead: "in credit", shortColor: "#F0C77E" }} />
            : <p className="m-0 text-[13px] text-white/55">Nothing lent yet.</p>}
        </div>
      </section>
    </header>
  );

  return (
    <Shell subtitle="" hero={hero}>
      <PillTabs label="People views" value={view} onChange={setView} tabs={[
        { key: "people", label: "People", icon: <PeopleIcon size={15} />, count: all.length },
        { key: "insights", label: "Insights", icon: <TrendIcon size={15} /> },
        { key: "due", label: "Due calendar", icon: <HistoryIcon size={15} />, count: datedDue },
      ]} />

      <Flash text={flash} />

      <div key={view} className="flex animate-fade-up flex-col gap-5 sm:gap-6">
        {view === "people" && (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-h-11 min-w-0 flex-[1_1_260px] items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:border-brand-2">
                  <SearchIcon size={16} className="text-slate-500" /><span className="sr-only">Search people</span>
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, reason, phone, notes"
                    className="min-w-0 flex-auto bg-transparent text-[14.5px] outline-none" />
                  {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="grid size-7 animate-pop-in place-items-center rounded-md text-slate-400 hover:bg-soft hover:text-ink"><CloseIcon size={14} /></button>}
                </label>
                <label className="flex min-h-11 items-center gap-2 text-[13px] text-slate-500">Sort
                  <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-11 rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink">
                    <option value="owes">Amount owed (highest)</option>
                    <option value="due">Due date (soonest)</option>
                    <option value="name">Name (A–Z)</option>
                    <option value="recent">Recent activity</option>
                  </select>
                </label>
                <div role="group" aria-label="Layout" className="flex rounded-lg border border-line-strong bg-surface p-0.5">
                  {(["list", "cards"] as const).map((l) => (
                    <button key={l} type="button" aria-pressed={layout === l} onClick={() => setLayout(l)}
                      className={`min-h-10 rounded-md px-3 text-[13px] font-medium capitalize transition-colors ${layout === l ? "bg-ink text-on-ink" : "text-slate-600 hover:text-ink"}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div role="group" aria-label="Filter by status" className="-mx-1 flex flex-wrap gap-1.5 px-1 pb-1">
                {chips.map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
                    className={`inline-flex min-h-9 flex-none items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-[background-color,color,transform] active:scale-95 ${filter === k ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-slate-600 hover:border-line-strong hover:text-ink"}`}>
                    {l}<span className={`tabular-nums ${filter === k ? "text-on-ink/70" : "text-slate-400"}`}>{count(k)}</span>
                  </button>
                ))}
                {bucket && (
                  <span className="inline-flex animate-pop-in items-center gap-1 rounded-full border border-line-strong bg-surface py-0.5 pl-3 pr-1 text-[13px] font-medium">
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ background: AGING_COLOR[bucket] }} />{buckets.find((b) => b.key === bucket)?.label}
                    <button type="button" onClick={() => setBucket(null)} aria-label="Remove this filter" className="grid size-7 place-items-center rounded-full text-slate-400 hover:bg-soft hover:text-ink"><CloseIcon size={12} /></button>
                  </span>
                )}
              </div>
            </div>

            {layout === "list" ? (
              <section aria-label="People" className="surface-card overflow-hidden">
                <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,0.75fr)_120px] gap-5 border-b border-line bg-subtle px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 md:grid">
                  <span>Person</span><span>Paid back so far</span><span className="text-right">Next due</span><span />
                </div>
                <ul key={`${filter}|${bucket}|${sort}|${query}`} className="m-0 list-none p-0">
                  {people.map((p, i) => <PersonRow key={p.id} p={p} i={i} q={query} today={today} viewer={viewer} onRepay={() => setRepaying(p)} />)}
                </ul>
                {!people.length && <NoMatch all={all.length} viewer={viewer} onClear={() => { setQ(""); setFilter("all"); setBucket(null); }} onAdd={() => setAdding(true)} />}
              </section>
            ) : (
              <>
                <ul key={`${filter}|${bucket}|${sort}|${query}`} className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
                  {people.map((p, i) => <PersonCard key={p.id} p={p} i={i} q={query} today={today} viewer={viewer} history={balances.get(p.id) ?? []} onRepay={() => setRepaying(p)} />)}
                </ul>
                {!people.length && <section className="surface-card"><NoMatch all={all.length} viewer={viewer} onClear={() => { setQ(""); setFilter("all"); setBucket(null); }} onAdd={() => setAdding(true)} /></section>}
              </>
            )}
          </>
        )}

        {view === "insights" && (
          <Insights data={data} today={today} year={year} buckets={buckets} owing={owing} receivables={d.receivables}
            onBucket={(b) => { setBucket(b); setFilter("owing"); setView("people"); }} onPerson={(id) => router.push(`/debtors/${id}`)} />
        )}

        {view === "due" && (
          <DueCalendar open={d.open} today={today} profiles={all} viewer={viewer} cardName={(id) => cardLabel(data.cards.find((c) => c.id === id))}
            onRepay={(id) => { const p = all.find((x) => x.id === id); if (p) setRepaying(p); }} />
        )}
      </div>

      {adding && (
        <AddDebtorDialog mode="loan" extended title="Add a loan" submitLabel="Add loan" account={account} knownNames={data.people.map((p) => p.name)}
          onClose={() => setAdding(false)} onAdded={(personId, text) => { setAdding(false); setFlash(text); if (personId) router.push(`/debtors/${personId}`); }} />
      )}
      {exporting && <ExportPdfDialog personId={null} name="Everyone" today={today} initial={{ from: "", to: "" }} onClose={() => setExporting(false)} />}
      {repaying && (
        <RepayDialog p={repaying} targets={repayTargets(all.find((x) => x.id === repaying.id) ?? repaying, data.cards)} account={account}
          onClose={() => setRepaying(null)} onSaved={(t) => { setRepaying(null); setFlash(t); }} />
      )}
    </Shell>
  );
}

const CHIP = { bad: "bg-bad-tint text-bad", owed: "bg-owed-tint text-owed", good: "bg-good-tint text-brand-2", muted: "bg-soft text-slate-500" } as const;

// ---- People: list row and card ----------------------------------------------------------------------------------

function PersonRow({ p, i, q, today, viewer, onRepay }: { p: Profile; i: number; q: string; today: string; viewer: boolean; onRepay: () => void }) {
  const s = standing(p);
  const owed = p.owes > 0;
  return (
    <li style={stagger(i, 30, 360)} className="group/row relative animate-fade-up border-b border-soft transition-colors last:border-0 hover:bg-subtle">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] origin-top scale-y-0 transition-transform duration-300 group-hover/row:scale-y-100 ${s.tone === "bad" ? "bg-bad" : s.tone === "good" ? "bg-brand-2" : "bg-owed-bar"}`} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,0.75fr)_120px] md:gap-5 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="transition-transform duration-300 ease-[var(--ease-spring)] group-hover/row:scale-105">
            <Ring pct={p.taken ? p.pct : 0} size={48} stroke={3.5} color={s.tone === "bad" ? "var(--color-bad)" : "var(--color-brand-2)"}>
              <Avatar text={p.initials} size={38} />
            </Ring>
          </span>
          <div className="min-w-0">
            <Link href={`/debtors/${p.id}`} className="block truncate rounded text-[15px] font-medium after:absolute after:inset-0 hover:text-brand-ink"><Mark text={p.name} q={q} /></Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[11.5px] font-medium ${CHIP[s.tone]}`}>
                <span aria-hidden="true" className={`size-1.5 rounded-full bg-current ${s.tone === "bad" ? "animate-pulse" : ""}`} />{s.label}
              </span>
              <span className="truncate text-[12px] text-slate-500"><Mark text={[...new Set(p.reasons)].slice(0, 2).join(", ")} q={q} /></span>
            </div>
          </div>
        </div>
        <span className="text-right md:hidden"><Money value={p.owes} tone={owed ? (s.tone === "bad" ? "bad" : "owed") : "good"} className="text-[16px]" /></span>
        <div className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1">
          <div className="flex items-baseline justify-between gap-2">
            <Money value={p.owes} tone={owed ? (s.tone === "bad" ? "bad" : "owed") : "good"} className="text-[16px] max-md:hidden" />
            <span className="text-[12px] text-slate-500">{owed ? `still owed of ${taka(p.taken)}` : p.taken ? "all paid back" : "nothing borrowed"}</span>
            <span className="money text-[12px] text-brand-2">{p.taken ? `${p.pct}%` : ""}</span>
          </div>
          {p.taken > 0 && <SplitBar className="h-2.5" parts={[{ value: p.paid, className: "bg-gradient-to-r from-brand-2 to-[#3DAA80]" }, { value: p.owes, className: s.tone === "bad" ? "bg-bad/70" : "bg-owed-bar/80" }]} />}
          <span className="text-[11.5px] text-slate-500">Repaid <Money value={p.paid} tone="good" /> · borrowed <Money value={p.taken} tone="muted" /></span>
        </div>
        <div className="flex items-center md:justify-end">{owed ? <DateChip iso={p.due} today={today} /> : <span className="text-[12.5px] text-slate-400">—</span>}</div>
        <span className="relative z-10 flex items-center justify-end gap-1">
          {!viewer && owed && <Button variant="secondary" size="sm" onClick={onRepay} className="max-md:min-h-10"><TrendIcon size={14} />Repay</Button>}
          <ChevronRight size={16} className="flex-none text-slate-400 transition-transform group-hover/row:translate-x-0.5 max-md:hidden" />
        </span>
      </div>
    </li>
  );
}

function PersonCard({ p, i, q, today, viewer, history, onRepay }: { p: Profile; i: number; q: string; today: string; viewer: boolean; history: number[]; onRepay: () => void }) {
  const s = standing(p);
  const owed = p.owes > 0;
  return (
    <li style={stagger(i, 45, 450)} className="surface-card lift spot group/card relative flex animate-fade-up flex-col gap-3 overflow-hidden p-4">
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${s.tone === "bad" ? "bg-bad" : s.tone === "good" ? "bg-brand-2" : s.tone === "owed" ? "bg-owed-bar" : "bg-line"}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="transition-transform duration-500 ease-[var(--ease-spring)] group-hover/card:rotate-[-8deg] group-hover/card:scale-110">
            <Ring pct={p.taken ? p.pct : 0} size={54} stroke={4} color={s.tone === "bad" ? "var(--color-bad)" : "var(--color-brand-2)"}><Avatar text={p.initials} size={42} /></Ring>
          </span>
          <div className="min-w-0">
            <Link href={`/debtors/${p.id}`} className="block truncate text-[15.5px] font-semibold after:absolute after:inset-0 hover:text-brand-ink"><Mark text={p.name} q={q} /></Link>
            <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-px text-[11.5px] font-medium ${CHIP[s.tone]}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{s.label}</span>
          </div>
        </div>
        {owed && <DateChip iso={p.due} today={today} size="sm" />}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="eyebrow">{owed ? "Owes you" : "Balance"}</span>
          <div className="money text-[24px] leading-tight"><Money value={p.owes} tone={owed ? (s.tone === "bad" ? "bad" : "owed") : "good"} /></div>
        </div>
        {history.length > 1 && <Sparkline values={history} color={s.tone === "bad" ? "var(--color-bad)" : "var(--color-owed-bar)"} width={110} height={36} />}
      </div>
      {p.taken > 0 && <SplitBar className="h-2" parts={[{ value: p.paid, className: "bg-brand-2" }, { value: p.owes, className: s.tone === "bad" ? "bg-bad/70" : "bg-owed-bar/70" }]} />}
      <div className="flex items-center justify-between gap-2 text-[12px] text-slate-500">
        <span>{p.pct}% repaid · {p.loanCount + p.cardCount} {p.loanCount + p.cardCount === 1 ? "entry" : "entries"}</span>
        {!viewer && owed && <Button variant="secondary" size="sm" onClick={onRepay} className="relative z-10"><TrendIcon size={14} />Repay</Button>}
      </div>
    </li>
  );
}

function NoMatch({ all, viewer, onClear, onAdd }: { all: number; viewer: boolean; onClear: () => void; onAdd: () => void }) {
  return (
    <div className="p-5">
      <EmptyState compact title={all ? "Nobody matches" : "No people yet"}
        action={all ? <Button variant="secondary" size="sm" onClick={onClear}>Clear search and filters</Button> : !viewer ? <Button size="sm" onClick={onAdd}>Add the first loan</Button> : undefined}>
        {all ? "Try another name, or a different status." : "When you lend money or someone uses your card, they appear here."}
      </EmptyState>
    </div>
  );
}

// ---- Insights -----------------------------------------------------------------------------------------------------

function Insights({ data, today, year, buckets, owing, receivables, onBucket, onPerson }: {
  data: FinanceData; today: string; year: ReturnType<typeof lendingMonths>; buckets: ReturnType<typeof aging>; owing: Profile[];
  receivables: { bankLoans: number; byCard: Record<string, number> }; onBucket: (b: AgingKey) => void; onPerson: (id: string) => void;
}) {
  const reasons = useMemo(() => lentFor(data).slice(0, 8), [data]);
  const maxReason = Math.max(1, ...reasons.map((r) => r.total));
  const owedAll = sumBy(buckets, (b) => b.amount);
  const top = [...owing].sort((a, b) => b.owes - a.owes);
  const slices = [
    ...top.slice(0, 7).map((p, i) => ({ name: p.name, value: p.owes, color: HUES[i % HUES.length], sub: `${p.pct}% repaid` })),
    ...(top.length > 7 ? [{ name: `${top.length - 7} others`, value: sumBy(top.slice(7), (p) => p.owes), color: "var(--color-slate-400)", sub: "everyone else" }] : []),
  ];
  const sources = [
    { name: "Bank loans", value: receivables.bankLoans, color: "var(--color-owed-bar)", sub: "lent from the bank" },
    ...data.cards.map((c, i) => ({ name: cardLabel(c), value: receivables.byCard[c.id] ?? 0, color: i ? "#2F5583" : "#B98E81", sub: "others' purchases on your card" })),
  ].filter((s) => s.value > 0);

  return (
    <>
      <section className="surface-card p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="m-0 text-[16px] font-semibold">Lent out and paid back, month by month</h2>
          <div className="mt-0.5 text-[13px] text-slate-500">The last 12 months, with what people owed you at each month&apos;s end drawn over the bars. Hover or use ←/→ to read a month.</div>
        </div>
        <FlowChart months={year} labels={LENDING_LABELS} />
      </section>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
          <div>
            <h2 className="m-0 text-[16px] font-semibold">How late the money is</h2>
            <div className="mt-0.5 text-[13px] text-slate-500">Everything still owed, by how far past its due date it is. Click a band to see those people.</div>
          </div>
          <span className="money text-[18px]">{taka(owedAll)}</span>
        </div>
        <div aria-hidden="true" className="mx-4 flex h-5 gap-[3px] overflow-hidden rounded-full sm:mx-5">
          {buckets.filter((b) => b.amount > 0).map((b, i) => (
            <button key={b.key} type="button" tabIndex={-1} onClick={() => onBucket(b.key)} title={`${b.label}: ${taka(b.amount)}`}
              className="bar-fill h-full first:rounded-l-full last:rounded-r-full transition-[filter] hover:brightness-110" style={{ width: `${(b.amount / (owedAll || 1)) * 100}%`, background: AGING_COLOR[b.key], animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
        <ul className="m-0 grid list-none gap-2 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          {buckets.map((b, i) => (
            <li key={b.key} style={stagger(i, 60)} className="animate-fade-up">
              <button type="button" disabled={!b.amount} onClick={() => onBucket(b.key)}
                className="lift flex w-full flex-col gap-1 rounded-xl border border-line p-3 text-left enabled:hover:bg-subtle disabled:opacity-50">
                <span className="flex items-center gap-2 text-[12.5px] font-medium text-slate-600"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: AGING_COLOR[b.key] }} />{b.label}</span>
                <span className="money text-[18px]">{taka(b.amount)}</span>
                <span className="text-[11.5px] text-slate-500">{b.people} {b.people === 1 ? "person" : "people"} · {b.count} {b.count === 1 ? "item" : "items"}{owedAll ? ` · ${Math.round((b.amount / owedAll) * 100)}%` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="surface-card p-4 sm:p-5">
          <h2 className="m-0 text-[16px] font-semibold">Who owes what</h2>
          <p className="m-0 mb-4 mt-0.5 text-[13px] text-slate-500">Hover to read; click a person to open their profile.</p>
          {slices.length ? <Donut title="What each person owes" centerLabel="Owed" slices={slices}
            onPick={(name) => { const p = top.find((x) => x.name === name); if (p) onPerson(p.id); }} /> : <EmptyState compact title="Nobody owes you">All paid back.</EmptyState>}
        </section>
        <section className="surface-card p-4 sm:p-5">
          <h2 className="m-0 text-[16px] font-semibold">Where it&apos;s owed</h2>
          <p className="m-0 mb-4 mt-0.5 text-[13px] text-slate-500">Bank loans and each card are kept apart — a repayment goes to the one you choose.</p>
          {sources.length ? <Donut title="Owed by source" centerLabel="Owed" slices={sources} /> : <EmptyState compact title="Nothing owed">No open balances.</EmptyState>}
        </section>
      </div>

      <section className="surface-card overflow-hidden">
        <div className="px-4 pb-2 pt-4 sm:px-5">
          <h2 className="m-0 text-[16px] font-semibold">What the money was lent for</h2>
          <div className="mt-0.5 text-[13px] text-slate-500">All time: loan reasons, and what others bought on your cards.</div>
        </div>
        {reasons.length ? (
          <ul className="m-0 grid list-none gap-x-6 gap-y-1 px-4 pb-4 sm:px-5 md:grid-cols-2">
            {reasons.map((r, i) => (
              <li key={r.name} style={stagger(i, 50)} className="group animate-fade-up py-1.5">
                <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="flex items-baseline gap-2"><span className="money">{taka(r.total)}</span><span className="w-12 text-right text-[11.5px] tabular-nums text-slate-500">{r.share}%</span></span>
                </div>
                <span aria-hidden="true" className="mt-1 block h-2 overflow-hidden rounded-full bg-soft">
                  <span className="bar-fill block h-full rounded-full transition-[filter] group-hover:brightness-110" style={{ width: `${(r.total / maxReason) * 100}%`, background: HUES[i % HUES.length], animationDelay: `${i * 70 + 150}ms` }} />
                </span>
                <span className="text-[11.5px] text-slate-500">{r.count} {r.count === 1 ? "entry" : "entries"}</span>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 px-4 pb-4 text-[13px] text-slate-500 sm:px-5">Nothing lent yet.</p>}
      </section>
      <p className="m-0 text-[12.5px] text-slate-500">Figures as of {dateLong(today)}. Bank and card balances are separate — see the Overview.</p>
    </>
  );
}

// ---- Due calendar -------------------------------------------------------------------------------------------------

function DueCalendar({ open, today, profiles, viewer, cardName, onRepay }: {
  open: ReturnType<typeof computeDashboard>["open"]; today: string; profiles: Profile[]; viewer: boolean; cardName: (id: string | null) => string; onRepay: (personId: string) => void;
}) {
  const days = useMemo(() => dueCalendar(open), [open]);
  const next = useMemo(() => [...days.keys()].filter((k) => k >= today).sort()[0] ?? [...days.keys()].sort().at(-1) ?? today, [days, today]);
  const [day, setDay] = useState<string>(next);
  const items = open.filter((o) => o.iso === day);
  const upcoming = open.filter((o) => o.iso && o.iso >= today && o.iso <= addDays(today, 30)).sort((a, b) => a.iso!.localeCompare(b.iso!));
  const late = open.filter((o) => o.iso && o.iso < today);
  const undated = open.filter((o) => !o.iso);
  const owedOn = (iso: string) => sumBy(open.filter((o) => o.iso === iso), (o) => o.left);
  const byDay = [...new Set(upcoming.map((o) => o.iso!))];
  const maxDay = Math.max(1, ...byDay.map(owedOn));

  return (
    <>
      <section className="surface-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="m-0 text-[16px] font-semibold">What falls due, day by day</h2>
            <div className="mt-0.5 text-[13px] text-slate-500">Six weeks back and fourteen ahead; today is outlined. Click a day to see who pays.</div>
          </div>
          <div className="flex flex-wrap gap-2 text-[12.5px]">
            <Badge tone="bad"><DueIcon size={12} />{taka(sumBy(late, (o) => o.left))} overdue</Badge>
            <Badge tone="owed">{taka(sumBy(upcoming, (o) => o.left))} in 30 days</Badge>
            {undated.length > 0 && <Badge tone="neutral">{taka(sumBy(undated, (o) => o.left))} no date</Badge>}
          </div>
        </div>
        <CalendarHeat days={days} end={addDays(today, 98)} weeks={20} today={today} selected={day} onPick={setDay}
          words={{ title: "Amounts falling due", item: ["item", "items"], none: "nothing due", summary: (n) => `${n} days with something due. Click one.` }} />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section key={day} className="surface-card animate-fade-up overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
            <div>
              <h2 className="m-0 text-[16px] font-semibold">{dateLong(day)}{day === today ? " · today" : ""}</h2>
              <div className="mt-0.5 text-[13px] text-slate-500">{items.length ? `${items.length} ${items.length === 1 ? "item" : "items"} due · ${taka(owedOn(day))}` : "Nothing due this day."}</div>
            </div>
            <DateChip iso={day} today={today} />
          </div>
          <ul className="m-0 list-none border-t border-line p-0">
            {items.map((o, i) => {
              const p = profiles.find((x) => x.id === o.personId);
              return (
                <li key={o.key} style={stagger(i, 50)} className="flex animate-fade-up items-center gap-3 border-b border-soft px-4 py-3 last:border-0 sm:px-5">
                  <Avatar text={p?.initials ?? "?"} size={36} />
                  <span className="min-w-0 flex-auto">
                    <Link href={`/debtors/${o.personId}`} className="block truncate text-[14.5px] font-medium hover:text-brand-ink hover:underline">{o.name}</Link>
                    <span className="block truncate text-[12px] text-slate-500">{o.source === "loan" ? "Bank loan" : cardName(o.cardId)}{o.emi ? " · EMI installment" : ""}</span>
                  </span>
                  <Money value={o.left} tone={o.status === "overdue" ? "bad" : "owed"} className="text-[15px]" />
                  {!viewer && <Button variant="secondary" size="sm" onClick={() => onRepay(o.personId)}><TrendIcon size={14} />Repay</Button>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="surface-card overflow-hidden">
          <div className="px-4 pb-3 pt-4 sm:px-5">
            <h2 className="m-0 text-[16px] font-semibold">Next 30 days</h2>
            <div className="mt-0.5 text-[13px] text-slate-500">Each day&apos;s total; click to open it on the left.</div>
          </div>
          {byDay.length ? (
            <ol className="m-0 list-none border-t border-line p-0">
              {byDay.map((iso, i) => (
                <li key={iso} style={stagger(i, 40)} className="animate-fade-up border-b border-soft last:border-0">
                  <button type="button" aria-pressed={iso === day} onClick={() => setDay(iso)}
                    className={`group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors sm:px-5 ${iso === day ? "bg-good-tint" : "hover:bg-subtle"}`}>
                    <DateChip iso={iso} today={today} size="sm" />
                    <span className="min-w-0 flex-auto">
                      <span className="block truncate text-[13.5px] font-medium">{[...new Set(open.filter((o) => o.iso === iso).map((o) => o.name))].join(", ")}</span>
                      <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-soft">
                        <span className="bar-fill block h-full rounded-full bg-owed-bar transition-[filter] group-hover:brightness-110" style={{ width: `${(owedOn(iso) / maxDay) * 100}%`, animationDelay: `${i * 40 + 120}ms` }} />
                      </span>
                    </span>
                    <Money value={owedOn(iso)} tone="owed" />
                  </button>
                </li>
              ))}
            </ol>
          ) : <p className="m-0 border-t border-line p-5 text-[13px] text-slate-500">Nothing falls due in the next 30 days.</p>}
        </section>
      </div>
    </>
  );
}

/** The next seven days as seven cells; a day with something due is filled. Day names are text. */
function WeekStrip({ today, dues, dark = false }: { today: string; dues: string[]; dark?: boolean }) {
  const days = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + k + 1);
    const iso = d.toISOString().slice(0, 10);
    return { iso, n: dues.filter((x) => x === iso).length, label: d.toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" }) };
  });
  return (
    <span aria-hidden="true" className="mt-1.5 grid grid-cols-7 gap-1">
      {days.map((d, i) => (
        <span key={d.iso} className="flex flex-col items-center gap-0.5">
          <span className={`viz-grow h-4 w-full rounded-[4px] ${d.n ? "bg-[#E8C27A]" : dark ? "bg-white/10" : "bg-soft"}`} style={{ animationDelay: `${i * 60}ms` }} />
          <span className={`text-[9.5px] ${dark ? "text-white/45" : "text-slate-400"}`}>{d.label}</span>
        </span>
      ))}
    </span>
  );
}
