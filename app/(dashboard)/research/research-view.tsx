"use client";

import { useMemo, useState, useTransition } from "react";
import { Shell, useViewer } from "@/components/shell";
import { CheckIcon, ChevronDown, DownloadIcon, EyeIcon, FileIcon, FlaskIcon, HistoryIcon, InIcon, OutIcon, PeopleIcon, PlusIcon, TrendIcon } from "@/components/icons";
import { Badge, Button, Menu } from "@/components/ui";
import { SECTION_TITLE, type ResearchSection } from "@/lib/research-stats";
import { subMoney, sumBy, toPaisa } from "@/lib/money";
import { ErrorBox, Modal, btnDanger, btnGhost, btnPrimary } from "@/components/modal";
import { CountUp, Spinner } from "@/components/motion";
import { Flash } from "@/components/debtors/bits";
import { PillTabs, RaceChart, Sparkline } from "@/components/research-viz";
import { deleteContribution, deleteExpense, saveContribution, saveExpense } from "@/lib/research-actions";
import {
  CONTRIBUTION_NOTES, DEFAULT_FACILITIES, DEFAULT_MEMBERS, mergeNames,
  type ResearchContribution, type ResearchData, type ResearchExpense,
} from "@/lib/research";
import { cumulative, monthlyFlow } from "@/lib/research-stats";
import { addDays, addMonths, dateLong, taka, todayIso } from "@/lib/format";
import { AnalyticsTab, ContributionsTab, LedgerTab, MonthlyTab, NO_FILTER, SettlementTab, takaDec, type DialogState, type LedgerFilter } from "./research-tabs";

type Tab = "ledger" | "contributions" | "settlement" | "analytics" | "monthly";
const TAB_SECTION: Record<Tab, ResearchSection> = { ledger: "expenses", contributions: "contributions", settlement: "settlement", analytics: "facilities", monthly: "monthly" };
type Preset = "all" | "month" | "3m" | "6m" | "12m" | "year";

const PRESETS: [Preset, string][] = [["all", "All time"], ["month", "This month"], ["3m", "3 months"], ["6m", "6 months"], ["12m", "12 months"], ["year", "This year"]];
function presetRange(p: Preset, today: string): { from: string; to: string } {
  if (p === "month") return { from: `${today.slice(0, 7)}-01`, to: "" };
  if (p === "year") return { from: `${today.slice(0, 4)}-01-01`, to: "" };
  if (p === "all") return { from: "", to: "" };
  return { from: addDays(addMonths(today, -Number(p.replace("m", ""))), 1), to: "" };
}

export function ResearchView({ data }: { data: ResearchData }) {
  const viewer = useViewer();
  const today = todayIso();
  const [tab, setTab] = useState<Tab>("ledger");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [flash, setFlash] = useState("");
  const [ledger, setLedger] = useState<LedgerFilter>(NO_FILTER);

  // Date range applies to every view, the totals, the reconciliation and the export.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const expenses = useMemo(() => data.expenses.filter((e) => (!from || e.spent_on >= from) && (!to || e.spent_on <= to)), [data.expenses, from, to]);
  const contributions = useMemo(() => data.contributions.filter((c) => (!from || c.paid_on >= from) && (!to || c.paid_on <= to)), [data.contributions, from, to]);
  const facilities = useMemo(() => mergeNames(DEFAULT_FACILITIES, data.expenses.map((e) => e.facility)), [data.expenses]);
  const members = useMemo(() => mergeNames(DEFAULT_MEMBERS, [...data.expenses.map((e) => e.member), ...data.contributions.map((c) => c.member)]), [data.expenses, data.contributions]);
  const flow = useMemo(() => monthlyFlow(expenses, contributions), [expenses, contributions]);

  const totalExp = sumBy(expenses, (e) => e.amount);
  const totalCon = sumBy(contributions, (c) => c.amount);
  const net = subMoney(totalCon, totalExp);
  // Reconciliation: every member's contributed and spent must add up to the ledger totals (to the paisa).
  const perCon = sumBy(members, (m) => sumBy(contributions.filter((c) => c.member === m), (c) => c.amount));
  const perExp = sumBy(members, (m) => sumBy(expenses.filter((e) => e.member === m), (e) => e.amount));
  const reconciled = toPaisa(perCon) === toPaisa(totalCon) && toPaisa(perExp) === toPaisa(totalExp);
  const exportHref = `/research/export${from || to ? `?${new URLSearchParams({ ...(from && { from }), ...(to && { to }) })}` : ""}`;
  const avg = expenses.length ? totalExp / expenses.length : 0;
  const peak = expenses.reduce((m, e) => Math.max(m, e.amount), 0);
  const preset = PRESETS.find(([p]) => { const r = presetRange(p, today); return r.from === from && r.to === to; })?.[0];
  const rangeText = from || to ? `${from ? dateLong(from) : "the start"} – ${to ? dateLong(to) : "today"}` : "all time";

  const openLedger = (f: Partial<LedgerFilter>) => { setLedger({ ...NO_FILTER, ...f }); setTab("ledger"); };
  /** One section as a PDF for the current date range (plus, for expenses, the list's filters). */
  const pdfHref = (section: ResearchSection, extra: Partial<LedgerFilter> = {}) => {
    const q = new URLSearchParams({ section });
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return `/research/export/pdf?${q}`;
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number | null }[] = [
    { key: "ledger", label: "Expenses", icon: <OutIcon size={15} />, count: expenses.length },
    { key: "contributions", label: "Contributions", icon: <InIcon size={15} />, count: contributions.length },
    { key: "settlement", label: "Settlement", icon: <PeopleIcon size={15} /> },
    { key: "analytics", label: "By facility & member", icon: <TrendIcon size={15} /> },
    { key: "monthly", label: "By month", icon: <HistoryIcon size={15} /> },
  ];

  const subtitle = "Clinical research spending, who paid for it, and how the team settles up.";

  if (data.missingTables) {
    return (
      <Shell subtitle={subtitle}>
        <section className="mx-auto w-full max-w-[720px] rounded-lg border border-owed-line bg-owed-tint p-4 sm:p-6">
          <h2 className="m-0 text-xl font-semibold text-owed">One-time setup needed</h2>
          <p className="mb-0 mt-2 text-[15px] text-slate-700">
            The research tables don&apos;t exist in Supabase yet. Open the Supabase dashboard → SQL Editor → New query, paste the
            contents of <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-sm">supabase/migrations/0003_research_ledger.sql</code>,
            click <strong>Run</strong>, then refresh this page.
          </p>
        </section>
      </Shell>
    );
  }

  const cover = totalExp ? (totalCon / totalExp) * 100 : totalCon ? 100 : 0;
  const spark = flow.slice(-12);

  const hero = (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-[720px]">
          <div className="eyebrow flex items-center gap-2">
            <FlaskIcon size={14} className="text-brand-2" />Records
            {viewer && <Badge tone="info" className="ml-1 normal-case tracking-normal"><EyeIcon size={12} />View only</Badge>}
          </div>
          <h1 className="m-0 mt-2 font-display text-title font-normal text-ink">Research ledger</h1>
          <p className="m-0 mt-2 text-[14.5px] text-slate-500">{subtitle}</p>
        </div>
        {!viewer && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="secondary" onClick={() => setDialog({ kind: "contribution", row: null })} className="flex-auto sm:flex-none"><PlusIcon size={15} />Record contribution</Button>
            <Button onClick={() => setDialog({ kind: "expense", row: null })} className="shine flex-auto sm:flex-none"><PlusIcon size={15} />Add expense</Button>
          </div>
        )}
      </div>

      <section aria-label="Research ledger at a glance" className="deck grid gap-5 p-4 sm:gap-6 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex items-center gap-4 sm:flex-wrap sm:gap-5">
            {/* Coverage ring: how much of the spending the contributions cover. */}
            <div className="relative grid size-[84px] flex-none place-items-center sm:size-[118px]">
              <span aria-hidden="true" className="viz-breathe absolute inset-2 rounded-full" style={{ background: `radial-gradient(closest-side, ${net < 0 ? "rgba(255,160,143,0.35)" : "rgba(125,212,184,0.35)"}, transparent)` }} />
              <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden="true">
                <defs>
                  <linearGradient id="rs-cover" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#92B5E8" /><stop offset="1" stopColor={net < 0 ? "#FFA08F" : "#7DD4B8"} />
                  </linearGradient>
                </defs>
                <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="9" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="url(#rs-cover)" strokeWidth="9" strokeLinecap="round"
                  pathLength={100} strokeDasharray="100" className="viz-sweep" style={{ ["--to" as string]: 100 - Math.min(cover, 100) }} />
              </svg>
              <span className="relative flex flex-col items-center text-white">
                <span className="money text-[24px] leading-none"><CountUp value={Math.round(cover)} format={(n) => `${Math.round(n)}%`} duration={1400} intro /></span>
                <span className="mt-1 text-[10.5px] uppercase tracking-[0.1em] text-white/55">covered</span>
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/60">{net < 0 ? "Short by" : "Left over"} · {rangeText}</span>
              <span className={`money text-[clamp(36px,5.5vw,56px)] font-medium leading-none tracking-[-0.03em] ${net < 0 ? "text-[#FFA08F]" : "text-white"}`}>
                <CountUp value={Math.abs(net)} format={taka} duration={1400} intro />
              </span>
              <span className="text-[12.5px] text-white/55">{net < 0 ? "Contributions don't cover the spending yet." : net > 0 ? "Contributions cover all the spending." : "Contributions exactly match the spending."}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 [&>:last-child:nth-child(odd)]:col-span-2 sm:[&>:last-child:nth-child(odd)]:col-span-1">
            <button type="button" onClick={() => setTab("ledger")} className="deck-tile group flex flex-col gap-1 p-4 text-left transition-colors">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55"><OutIcon size={13} className="text-[#E8C27A]" />Spent</span>
              <span className="money text-[22px] leading-tight text-[#F0C77E]"><CountUp value={totalExp} format={taka} duration={1300} intro /></span>
              <span className="text-[12px] text-white/55">{expenses.length} expenses</span>
              <Sparkline values={spark.map((m) => m.spent)} color="#E8C27A" width={140} height={28} className="mt-1 w-full max-w-[140px]" />
            </button>
            <button type="button" onClick={() => setTab("contributions")} className="deck-tile group flex flex-col gap-1 p-4 text-left transition-colors">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55"><InIcon size={13} className="text-[#92B5E8]" />Contributed</span>
              <span className="money text-[22px] leading-tight text-[#B9D0F2]"><CountUp value={totalCon} format={taka} duration={1300} intro /></span>
              <span className="text-[12px] text-white/55">{contributions.length} member payments</span>
              <Sparkline values={spark.map((m) => m.contributed)} color="#92B5E8" width={140} height={28} className="mt-1 w-full max-w-[140px]" />
            </button>
            <button type="button" onClick={() => setTab("analytics")} className="deck-tile group flex flex-col gap-1 p-4 text-left transition-colors">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">Average expense</span>
              <span className="money text-[22px] leading-tight text-white"><CountUp value={avg} format={(n) => takaDec(Math.round(n * 100) / 100)} duration={1300} intro /></span>
              <span className="text-[12px] text-white/55">Largest {taka(peak)}</span>
              <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10">
                <span className="bar-fill block h-full rounded-full bg-gradient-to-r from-[#7DD4B8] to-[#E8C27A]" style={{ width: `${peak ? Math.max((avg / peak) * 100, 3) : 0}%` }} />
              </span>
              <span className="text-[10.5px] text-white/45">average as a share of the largest</span>
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center">
          {flow.length ? <RaceChart points={cumulative(flow)} /> : <p className="m-0 text-[13px] text-white/55">Nothing recorded in this period yet.</p>}
        </div>

        <p role="status" className={`m-0 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/10 pt-4 text-[12.5px] lg:col-span-2 ${reconciled ? "text-white/65" : "font-medium text-[#FFA08F]"}`}>
          <span className="rounded-full border border-[#92B5E8]/40 bg-[#92B5E8]/10 px-2 py-0.5 text-[11px] font-semibold text-[#B9D0F2]">Separate ledger</span>
          {reconciled ? <CheckIcon size={14} className="text-[#7DD4B8]" /> : "⚠"}
          {reconciled ? "Reconciled:" : "Doesn't reconcile:"} members&apos; contributions add up to {taka(perCon)} and their spending to {taka(perExp)}.
          <span className="text-white/45">Team research money only — not part of your bank, cards or loans.</span>
        </p>
      </section>
    </header>
  );

  return (
    <Shell subtitle={subtitle} hero={hero}>
      <div className="surface-card flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <div role="group" aria-label="Quick date range" className="flex flex-wrap gap-1.5">
          {PRESETS.map(([p, label]) => (
            <button key={p} type="button" aria-pressed={preset === p} onClick={() => { const r = presetRange(p, today); setFrom(r.from); setTo(r.to); }}
              className={`min-h-9 rounded-full border px-3 text-[13px] font-medium transition-[background-color,color,border-color,transform] duration-200 active:scale-95 ${preset === p ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-slate-600 hover:border-line-strong hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600">From
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="min-h-9 rounded-lg border border-line-strong bg-surface px-2 text-[13px]" /></label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600">To
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="min-h-9 rounded-lg border border-line-strong bg-surface px-2 text-[13px]" /></label>
        </div>
        <div className="ml-auto">
          <Menu label="Export" align="end" triggerClass="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-info-line bg-info-tint px-3 text-[13px] font-medium text-info transition-transform hover:-translate-y-0.5"
            trigger={<><DownloadIcon size={14} />Export<ChevronDown size={13} /></>}
            items={[
              ...(["expenses", "contributions", "settlement", "facilities", "monthly"] as const).map((s) => ({
                kind: "link" as const, label: `${SECTION_TITLE[s]} (PDF)`, icon: <FileIcon size={16} />, href: pdfHref(s), download: true,
              })),
              { kind: "link" as const, label: "Full report (PDF)", icon: <FileIcon size={16} />, href: pdfHref("all"), download: true },
              { kind: "separator" as const },
              { kind: "link" as const, label: "All records (CSV)", icon: <DownloadIcon size={16} />, href: exportHref, download: true },
            ]} />
        </div>
      </div>

      <PillTabs label="Research views" tabs={tabs} value={tab} onChange={setTab} />

      <Flash text={flash} />

      {/* The current view as a PDF — exactly what's shown (for Expenses, with the list's search and filters). */}
      <div className="-mb-2 flex flex-wrap items-center justify-end gap-2 sm:-mb-3">
        <a key={tab} href={tab === "ledger" ? pdfHref("expenses", ledger) : pdfHref(TAB_SECTION[tab])} download
          className="inline-flex min-h-9 animate-pop-in items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium shadow-[var(--shadow-card)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
          <FileIcon size={14} className="text-bad" />Export {tab === "ledger" && (ledger.q || ledger.fac || ledger.mem || ledger.month || ledger.day) ? "these expenses" : SECTION_TITLE[TAB_SECTION[tab]].toLowerCase()} (PDF)
        </a>
      </div>

      <div key={`${tab}|${from}|${to}`} className="flex animate-fade-up flex-col gap-5 sm:gap-6">
        {tab === "ledger" && <LedgerTab expenses={expenses} facilities={facilities} members={members} setDialog={setDialog} filter={ledger} setFilter={setLedger} end={to && to < today ? to : today} />}
        {tab === "contributions" && <ContributionsTab contributions={contributions} members={members} setDialog={setDialog} />}
        {tab === "settlement" && (
          <SettlementTab expenses={expenses} contributions={contributions} members={members} totalExp={totalExp} totalCon={totalCon} setDialog={setDialog} />
        )}
        {tab === "analytics" && <AnalyticsTab expenses={expenses} facilities={facilities} members={members} onSettlement={() => setTab("settlement")} onOpenLedger={openLedger} />}
        {tab === "monthly" && <MonthlyTab expenses={expenses} contributions={contributions} facilities={facilities} members={members} onOpenLedger={openLedger} />}
      </div>

      {dialog?.kind === "expense" && (
        <ExpenseDialog row={dialog.row} facilities={facilities} members={members} onClose={() => setDialog(null)}
          onSaved={(t) => { setDialog(null); setFlash(t); }} />
      )}
      {dialog?.kind === "contribution" && (
        <ContributionDialog row={dialog.row} member={dialog.member} members={members} onClose={() => setDialog(null)}
          onSaved={(t) => { setDialog(null); setFlash(t); }} />
      )}
      {dialog?.kind === "delete-expense" && (
        <ConfirmDelete
          what={`the ${taka(dialog.row.amount)} expense “${dialog.row.description}” from ${dateLong(dialog.row.spent_on)}`}
          run={() => deleteExpense(dialog.row.id)}
          onClose={() => setDialog(null)} onDone={(t) => { setDialog(null); setFlash(t); }} />
      )}
      {dialog?.kind === "delete-contribution" && (
        <ConfirmDelete
          what={`${dialog.row.member}'s ${taka(dialog.row.amount)} contribution from ${dateLong(dialog.row.paid_on)}`}
          run={() => deleteContribution(dialog.row.id)}
          onClose={() => setDialog(null)} onDone={(t) => { setDialog(null); setFlash(t); }} />
      )}
    </Shell>
  );
}

function ExpenseDialog({ row, facilities, members, onClose, onSaved }: {
  row: ResearchExpense | null; facilities: string[]; members: string[]; onClose: () => void; onSaved: (t: string) => void;
}) {
  const [f, setF] = useState({
    spent_on: row?.spent_on ?? todayIso(),
    facility: row?.facility ?? facilities[0] ?? "",
    member: row?.member ?? members[0] ?? "",
    description: row?.description ?? "",
    tag: row?.tag ?? "",
    amount: row ? String(row.amount) : "",
  });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setError(""); };

  return (
    <Modal title={row ? "Edit expense" : "Add expense"} onClose={onClose} maxWidth={580}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={pending} className={btnPrimary}
          onClick={() => start(async () => {
            const r = await saveExpense(row?.id ?? null, { ...f, amount: Number(f.amount) });
            if (r.error) setError(r.error);
            else onSaved(`${row ? "Updated" : "Added"} ${taka(Number(f.amount))} expense at ${f.facility.trim()} paid by ${f.member.trim()}.`);
          })}>
          {pending && <Spinner />}{pending ? "Saving…" : row ? "Save changes" : "Add expense"}
        </button>
      </>}>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <label className="field-label">Date<input type="date" className="field-input" value={f.spent_on} onChange={set("spent_on")} /></label>
        <label className="field-label">Amount (৳) *<input type="number" min="1" inputMode="decimal" className="field-input tabular-nums" value={f.amount} onChange={set("amount")} placeholder="0" /></label>
        <label className="field-label">Facility / center *
          <input list="research-facilities" className="field-input border-2 border-brand-2" value={f.facility} onChange={set("facility")} autoComplete="off" />
          <datalist id="research-facilities">{facilities.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        <label className="field-label">Paid by *
          <input list="research-members" className="field-input" value={f.member} onChange={set("member")} autoComplete="off" />
          <datalist id="research-members">{members.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        <label className="field-label sm:col-span-2">Description
          <input className="field-input" value={f.description} onChange={set("description")} placeholder={`Leave empty for “${f.facility || "BHS"} [${f.member || "Raja"}]”`} />
        </label>
        <label className="field-label sm:col-span-2">Tag (optional)
          <input className="field-input" value={f.tag} onChange={set("tag")} placeholder="e.g. Printer Vara, DVD Recording, Dicom App" />
        </label>
        {error && <ErrorBox className="sm:col-span-2">{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

function ContributionDialog({ row, member, members, onClose, onSaved }: {
  row: ResearchContribution | null; member?: string; members: string[]; onClose: () => void; onSaved: (t: string) => void;
}) {
  const [f, setF] = useState({
    paid_on: row?.paid_on ?? todayIso(),
    member: row?.member ?? member ?? "",
    note: row?.note ?? "Cash",
    amount: row ? String(row.amount) : "",
  });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setError(""); };

  return (
    <Modal title={row ? "Edit contribution" : "Record contribution"} onClose={onClose} maxWidth={520}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={pending} className={btnPrimary}
          onClick={() => start(async () => {
            const r = await saveContribution(row?.id ?? null, { ...f, amount: Number(f.amount) });
            if (r.error) setError(r.error);
            else onSaved(`${row ? "Updated" : "Recorded"} ${taka(Number(f.amount))} contribution from ${f.member.trim()}.`);
          })}>
          {pending && <Spinner />}{pending ? "Saving…" : row ? "Save changes" : "Record contribution"}
        </button>
      </>}>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <label className="field-label sm:col-span-2">Member *
          <input list="research-members-c" className="field-input border-2 border-info" value={f.member} onChange={set("member")} autoComplete="off" placeholder="e.g. Adnan, Somik" />
          <datalist id="research-members-c">{members.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        <label className="field-label">Amount (৳) *<input type="number" min="1" inputMode="decimal" className="field-input tabular-nums" value={f.amount} onChange={set("amount")} placeholder="0" /></label>
        <label className="field-label">Date<input type="date" className="field-input" value={f.paid_on} onChange={set("paid_on")} /></label>
        <label className="field-label sm:col-span-2">Notes &amp; reference
          <input list="research-notes" className="field-input" value={f.note} onChange={set("note")} autoComplete="off" />
          <datalist id="research-notes">{CONTRIBUTION_NOTES.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        {error && <ErrorBox className="sm:col-span-2">{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

function ConfirmDelete({ what, run, onClose, onDone }: {
  what: string; run: () => Promise<{ error?: string }>; onClose: () => void; onDone: (t: string) => void;
}) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <Modal title="Delete this entry?" onClose={onClose} maxWidth={480}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={pending} className={btnDanger}
          onClick={() => start(async () => { const r = await run(); if (r.error) setError(r.error); else onDone("Entry deleted."); })}>
          {pending && <Spinner />}{pending ? "Deleting…" : "Delete"}
        </button>
      </>}>
      <div className="flex flex-col gap-3 p-5 text-[15px]">
        <p className="m-0">This permanently deletes {what}. Export a CSV first if you want a copy.</p>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}
