"use client";

import { useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { UnderlineTabs } from "@/components/motion";
import { SectionCard, SectionHead } from "@/components/debtors/bits";
import { Badge, EmptyState, Money } from "@/components/ui";
import { InfoIcon } from "@/components/icons";
import { computeDashboard } from "@/lib/dashboard";
import { forecast } from "@/lib/forecast";
import { reportRows } from "@/lib/reports";
import { timeMachine } from "@/lib/history";
import { addDays, dateLong, monthLabel } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { FinanceData } from "@/lib/types";
import type { ResearchData } from "@/lib/research";

type Tab = "report" | "outlook" | "past";

export function ReportsView({ data, research, today }: { data: FinanceData; research: ResearchData; today: string }) {
  const [tab, setTab] = useState<Tab>("report");
  return (
    <Shell subtitle="Monthly and yearly reports, a forward-looking outlook, and what can be rebuilt for past dates.">
      <div className="border-b border-line">
        <UnderlineTabs label="Views" value={tab} onChange={setTab} tabs={[["report", "Reports", null], ["outlook", "Outlook", null], ["past", "Time machine", null]]} />
      </div>
      <div key={tab} className="flex animate-fade-in flex-col gap-5">
        {tab === "report" && <Report data={data} research={research} today={today} />}
        {tab === "outlook" && <Outlook data={data} today={today} />}
        {tab === "past" && <Past data={data} research={research} today={today} />}
      </div>
    </Shell>
  );
}

// ---- Reports -------------------------------------------------------------------------------------------------------

const COLS = [
  ["lentLoans", "Loans given", "Bank loans made in the period."],
  ["lentCard", "Others' card use", "Purchases others made on your cards (incl. EMI charges). A card liability, not cash."],
  ["ownCard", "Your card spending", "Your own purchases on your cards."],
  ["collectedLoans", "Loan repayments", "Repayments received for loans."],
  ["collectedCard", "Card repayments", "Repayments received for card purchases."],
  ["creditedToBank", "Into the bank", "The part of loan repayments recorded as added to the bank. Already included in “Loan repayments” — don't add them."],
  ["emiDue", "EMI due", "EMI installments scheduled in the period (a schedule, not money moved)."],
  ["receivablesEnd", "Owed at end", "What people owed you at the end of the period (a balance, not a flow)."],
  ["researchSpent", "Research spent", "Separate research ledger."],
  ["researchContributed", "Research contributed", "Separate research ledger."],
] as const;

function Report({ data, research, today }: { data: FinanceData; research: ResearchData; today: string }) {
  const [mode, setMode] = useState<"month" | "year">("month");
  const rows = useMemo(() => reportRows(data, research, mode, today), [data, research, mode, today]);
  const flows = COLS.slice(0, 5).map(([k]) => k);
  return (
    <SectionCard labelledBy="rep-h">
      <SectionHead id="rep-h" title={mode === "month" ? "Monthly report" : "Yearly report"} sub="Each ledger event appears once, in one column of one period."
        action={
          <div role="group" aria-label="Period" className="flex rounded-lg border border-line bg-soft p-0.5">
            {(["month", "year"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                className={`min-h-8 rounded-md px-3 text-[13px] font-medium ${mode === m ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-slate-500"}`}>{m === "month" ? "Monthly" : "Yearly"}</button>
            ))}
          </div>
        } />
      {rows.length ? (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[1100px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-subtle text-left">
                <th scope="col" className="sticky left-0 bg-subtle px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">Period</th>
                {COLS.map(([k, l, help]) => <th key={k} scope="col" title={help} className="px-3 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-[0.05em] text-slate-500">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-soft">
                  <th scope="row" className="sticky left-0 bg-surface px-4 py-2 text-left font-medium">{r.key.length === 4 ? r.key : monthLabel(r.key)}</th>
                  {COLS.map(([k]) => <td key={k} className="px-3 py-2 text-right">{r[k] ? <Money value={r[k]} tone={k.startsWith("collected") || k === "creditedToBank" ? "good" : k === "receivablesEnd" ? "owed" : "ink"} /> : <span className="text-slate-400">—</span>}</td>)}
                </tr>
              ))}
              <tr className="border-t border-line-strong bg-subtle font-medium">
                <th scope="row" className="sticky left-0 bg-subtle px-4 py-2 text-left">Total</th>
                {COLS.map(([k]) => <td key={k} className="px-3 py-2 text-right">{(flows as readonly string[]).includes(k) || k.startsWith("research") || k === "creditedToBank" || k === "emiDue" ? <Money value={sumBy(rows, (r) => r[k])} /> : <span className="text-[11.5px] font-normal text-slate-500">balance</span>}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      ) : <div className="border-t border-line p-5"><EmptyState compact title="No activity yet" /></div>}
      <dl className="m-0 grid gap-x-6 gap-y-1.5 border-t border-line p-4 text-[12px] sm:grid-cols-2 sm:p-5">
        {COLS.map(([k, l, help]) => <div key={k}><dt className="inline font-semibold">{l}: </dt><dd className="m-0 inline text-slate-500">{help}</dd></div>)}
      </dl>
    </SectionCard>
  );
}

// ---- Outlook ------------------------------------------------------------------------------------------------------

function Outlook({ data, today }: { data: FinanceData; today: string }) {
  const d = useMemo(() => computeDashboard(data, today), [data, today]);
  const [days, setDays] = useState(30);
  const [delayed, setDelayed] = useState<Set<string>>(new Set());
  const f = useMemo(() => forecast(d, days, delayed), [d, days, delayed]);
  const peopleInRange = [...new Map(f.expected.map((o) => [o.personId, o.name])).entries()];
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-info-line bg-info-tint px-4 py-3 text-[13px] text-slate-700">
        <InfoIcon size={16} className="text-info" />
        <span className="min-w-0 flex-auto"><b>Projections, not balances.</b> Built only from recorded due dates, EMI schedules and card pay-by dates. Collections are uncertain; card collections reduce what you owe on the card — they never become cash.</span>
        <label className="flex items-center gap-1.5">Next
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="min-h-9 rounded-lg border border-line-strong bg-surface px-2">
            <option value={7}>7 days</option><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {f.scenarios.map((s) => (
          <div key={s.id} className="surface-card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between"><span className="text-[14px] font-semibold">{s.label}</span><Badge tone="info" className="text-[10.5px]">Projection</Badge></div>
            <dl className="m-0 grid gap-1 text-[13px]">
              <div className="flex justify-between"><dt className="text-slate-500">{d.bank?.name ?? "Bank"} by {dateLong(f.until)}</dt><dd className="m-0"><Money value={s.cash} /></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Owed on cards</dt><dd className="m-0"><Money value={s.cardOwed} tone="bad" /></dd></div>
            </dl>
            <p className="m-0 text-[12px] text-slate-500">{s.note}</p>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <SectionCard labelledBy="ob-h">
          <SectionHead id="ob-h" title="Confirmed obligations" sub={`Card bills with a pay-by date up to ${dateLong(f.until)}. Full balance (minimums aren't tracked).`} />
          <ul className="m-0 list-none border-t border-line p-0">
            {f.obligations.map((o) => (
              <li key={o.cardId} className="flex justify-between gap-3 border-b border-soft px-4 py-2.5 last:border-0 sm:px-5 text-[13.5px]">
                <span>{o.label}<span className={`block text-[12px] ${o.passed ? "font-medium text-bad" : "text-slate-500"}`}>Pay by {dateLong(o.iso)}{o.passed ? " — date passed" : ""}</span></span>
                <Money value={o.amount} tone="bad" />
              </li>
            ))}
            {!f.obligations.length && <li className="p-4 text-[13px] text-slate-500">No card bill falls due in this period.</li>}
          </ul>
        </SectionCard>
        <SectionCard labelledBy="ex-h">
          <SectionHead id="ex-h" title="Expected collections (uncertain)" sub={`Loans ${Math.round(f.expectedLoans).toLocaleString("en-IN")} → bank · Card ${Math.round(f.expectedCards).toLocaleString("en-IN")} → cards. Tick anyone you expect to pay late.`} />
          <ul className="m-0 list-none border-t border-line p-0">
            {peopleInRange.map(([id, name]) => {
              const xs = f.expected.filter((o) => o.personId === id);
              return (
                <li key={id} className="border-b border-soft px-4 py-2 last:border-0 sm:px-5">
                  <label className="flex cursor-pointer items-center gap-3 text-[13.5px]">
                    <input type="checkbox" checked={delayed.has(id)} onChange={() => setDelayed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} className="size-[18px] accent-bad" />
                    <span className="min-w-0 flex-auto"><span className="font-medium">{name}</span><span className="block text-[12px] text-slate-500">{xs.map((o) => `${o.source === "loan" ? "loan" : "card"} ${o.iso?.slice(5)}`).join(" · ")}</span></span>
                    <span className="text-[12px] text-slate-500">{delayed.has(id) ? "delayed" : ""}</span>
                    <Money value={sumBy(xs, (o) => o.left)} tone="owed" />
                  </label>
                </li>
              );
            })}
            {!peopleInRange.length && <li className="p-4 text-[13px] text-slate-500">No dated collections fall in this period.</li>}
          </ul>
          {f.overdue.length > 0 && <p className="m-0 border-t border-line px-4 py-2.5 text-[12.5px] text-bad sm:px-5">Not counted: <Money value={sumBy(f.overdue, (o) => o.left)} tone="bad" /> already overdue — it was expected and hasn't come.</p>}
        </SectionCard>
      </div>
    </>
  );
}

// ---- Time machine ------------------------------------------------------------------------------------------------

function Past({ data, research, today }: { data: FinanceData; research: ResearchData; today: string }) {
  const [date, setDate] = useState(addDays(today, -30));
  const tm = useMemo(() => (date && date <= today ? timeMachine(data, research, date, today) : null), [data, research, date, today]);
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="field-label">Look at the end of
          <input type="date" value={date} max={today} min={tm?.firstRecord ?? undefined} onChange={(e) => setDate(e.target.value)} className="field-input" />
        </label>
        {tm?.firstRecord && <span className="pb-3 text-[12.5px] text-slate-500">Records start {dateLong(tm.firstRecord)}.</span>}
      </div>
      <div className="flex gap-2.5 rounded-xl border border-owed-line bg-owed-tint p-3.5 text-[13px] text-slate-700">
        <InfoIcon size={16} className="mt-0.5 flex-none text-owed" />
        <span><b>Bank and card balances can't be shown for past dates.</b> They're stored as single numbers you update by hand, with no dated history — any past figure would be a guess. What people owed you and the research ledger <i>can</i> be rebuilt, because every loan, card use, repayment, expense and contribution is dated. Records deleted later are not included.</span>
      </div>
      {tm && (
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard labelledBy="tm-r">
            <SectionHead id="tm-r" title="Owed to you" sub={`${dateLong(tm.date)} → today`} />
            <dl className="m-0 grid gap-px border-t border-line bg-line text-[13.5px]">
              <Row k="Bank loans" a={tm.then.receivables.bankLoans} b={tm.now.receivables.bankLoans} />
              {data.cards.map((c) => <Row key={c.id} k={`${c.bank} card`} a={tm.then.receivables.byCard[c.id] ?? 0} b={tm.now.receivables.byCard[c.id] ?? 0} />)}
              <Row k="Total" a={tm.then.receivables.total} b={tm.now.receivables.total} strong />
            </dl>
            <p className="m-0 border-t border-line px-4 py-3 text-[12.5px] text-slate-500 sm:px-5">
              Since then: lent <Money value={tm.since.lent} />, others' card use <Money value={tm.since.cardUse} />, repaid <Money value={tm.since.repaid} tone="good" />. Then + lent + card use − repaid = today.
            </p>
          </SectionCard>
          <SectionCard labelledBy="tm-s">
            <SectionHead id="tm-s" title="Research ledger" sub={`${dateLong(tm.date)} → today`} />
            <dl className="m-0 grid gap-px border-t border-line bg-line text-[13.5px]">
              <Row k="Spent" a={tm.then.research.spent} b={tm.now.research.spent} />
              <Row k="Contributed" a={tm.then.research.contributed} b={tm.now.research.contributed} />
              <Row k="Contributed − spent" a={tm.then.research.net} b={tm.now.research.net} strong signed />
            </dl>
          </SectionCard>
        </div>
      )}
    </>
  );
}

function Row({ k, a, b, strong, signed }: { k: string; a: number; b: number; strong?: boolean; signed?: boolean }) {
  return (
    <div className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 bg-surface px-4 py-2.5 sm:px-5 ${strong ? "font-semibold" : ""}`}>
      <dt>{k}</dt>
      <dd className="m-0 text-right"><Money value={a} signed={signed} tone="muted" /></dd>
      <dd aria-hidden="true" className="m-0 text-slate-400">→</dd>
      <dd className="m-0 text-right"><Money value={b} signed={signed} /></dd>
    </div>
  );
}
