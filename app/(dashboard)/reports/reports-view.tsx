"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { UnderlineTabs } from "@/components/motion";
import { SectionCard, SectionHead } from "@/components/debtors/bits";
import { Badge, Button, EmptyState, Money } from "@/components/ui";
import { ChevronLeft, ChevronRight, InfoIcon } from "@/components/icons";
import { computeDashboard, type Activity } from "@/lib/dashboard";
import { forecast } from "@/lib/forecast";
import { reportRows } from "@/lib/reports";
import { timeMachine } from "@/lib/history";
import { addDays, dateLong, dateShort, monthLabel, taka } from "@/lib/format";
import { subMoney, sumBy, toPaisa } from "@/lib/money";
import type { FinanceData } from "@/lib/types";
import type { ResearchData } from "@/lib/research";

type Tab = "month" | "outlook" | "past";

export function ReportsView({ data, research, today }: { data: FinanceData; research: ResearchData; today: string }) {
  const [tab, setTab] = useState<Tab>("month");
  return (
    <Shell subtitle="What changed in a month: money lent out, money paid back, and what people owe you at the end.">
      <div className="border-b border-line">
        <UnderlineTabs label="Views" value={tab} onChange={setTab} tabs={[["month", "By month", null], ["outlook", "Outlook", null], ["past", "Past dates", null]]} />
      </div>
      <div key={tab} className="flex animate-fade-in flex-col gap-5">
        {tab === "month" && <MonthSummary data={data} research={research} today={today} />}
        {tab === "outlook" && <Outlook data={data} today={today} />}
        {tab === "past" && <Past data={data} research={research} today={today} />}
      </div>
    </Shell>
  );
}

// ---- One month ------------------------------------------------------------------------------------------------------

const KIND_LABEL: Record<Activity["kind"], string> = { loan: "Loan", card_other: "Card purchase", card_own: "Your card spending", repayment: "Repayment" };

/**
 * One selected month. Every figure comes from lib/reports (each ledger entry is counted once, in one line) and
 * lib/history; the lines that are easy to misread say what they are.
 */
function MonthSummary({ data, research, today }: { data: FinanceData; research: ResearchData; today: string }) {
  const rows = useMemo(() => reportRows(data, research, "month", today), [data, research, today]);
  const d = useMemo(() => computeDashboard(data, today), [data, today]);
  const [key, setKey] = useState(rows[0]?.key ?? today.slice(0, 7));
  const [kind, setKind] = useState<"all" | "out" | "in">("all");
  const i = rows.findIndex((r) => r.key === key);
  const r = rows[i];
  if (!r) return <EmptyState title="No activity yet">Once you record a loan, card purchase or repayment, each month's summary appears here.</EmptyState>;

  const start = rows[i + 1]?.receivablesEnd ?? 0;
  const lent = sumBy([r.lentLoans, r.lentCard], (x) => x);
  const back = sumBy([r.collectedLoans, r.collectedCard], (x) => x);
  const change = subMoney(r.receivablesEnd, start);
  const flowChange = subMoney(lent, back);
  const entries = d.activity.filter((a) => a.iso.startsWith(r.key) && (kind === "all" || (kind === "in" ? a.kind === "repayment" : a.kind !== "repayment")));
  const step = (by: number) => { const k = rows[i - by]?.key; if (k) setKey(k); };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => step(-1)} disabled={i >= rows.length - 1} aria-label="Previous month"><ChevronLeft size={16} /></Button>
        <label className="sr-only" htmlFor="month-pick">Month</label>
        <select id="month-pick" value={key} onChange={(e) => setKey(e.target.value)} className="min-h-10 rounded-lg border border-line-strong bg-surface px-3 font-display text-[22px] leading-none">
          {rows.map((x) => <option key={x.key} value={x.key}>{monthLabel(x.key)}</option>)}
        </select>
        <Button variant="secondary" size="sm" onClick={() => step(1)} disabled={i <= 0} aria-label="Next month"><ChevronRight size={16} /></Button>
        {r.key === today.slice(0, 7) && <Badge tone="info">So far · to {dateLong(today)}</Badge>}
      </div>

      <section aria-label={`${monthLabel(r.key)} at a glance`} className="grid gap-3 md:grid-cols-3">
        <Block title="Lent out" total={lent} tone="owed" lines={[["Bank loans given", r.lentLoans], ["Other people's card purchases", r.lentCard, "Includes any EMI charges they owe. A charge on your card, not cash from the bank."]]} />
        <Block title="Paid back to you" total={back} tone="good" lines={[["For loans", r.collectedLoans], ["For card purchases", r.collectedCard], [`… of which put into ${d.bank?.name ?? "the bank"}`, r.creditedToBank, "Part of “For loans”, not extra money — don't add it again."]]} />
        <div className="surface-card flex flex-col gap-2 p-4">
          <span className="eyebrow">Owed to you</span>
          <span className="flex flex-wrap items-baseline gap-x-2"><Money value={start} tone="muted" className="text-[15px]" /><span aria-hidden="true" className="text-slate-400">→</span><Money value={r.receivablesEnd} tone="owed" className="text-figure" /></span>
          <span className={`text-[13px] font-medium ${change > 0 ? "text-owed" : change < 0 ? "text-brand-2" : "text-slate-500"}`}>
            {change > 0 ? `Up ${taka(change)}` : change < 0 ? `Down ${taka(change)}` : "No change"} over the month
          </span>
          <span className="text-[12px] text-slate-500">
            A balance at the start and end of {monthLabel(r.key)}.{toPaisa(change) !== toPaisa(flowChange) ? ` It moved by ${taka(change)} while lent − repaid is ${taka(flowChange)}: someone paid more than they owed on one source, and an overpayment doesn't reduce what's owed elsewhere.` : " Lent out − paid back = the change."}
          </span>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Mini label="Your own card spending" value={r.ownCard} note="Not owed to you — part of your card bill." />
        <Mini label="EMI installments due" value={r.emiDue} note="Scheduled for this month, whether paid or not." />
        <Mini label="Research ledger" value={null} note={`Spent ${taka(r.researchSpent)} · contributed ${taka(r.researchContributed)}. Kept separate from your money.`} />
      </div>

      <SectionCard labelledBy="mo-h">
        <SectionHead id="mo-h" title={`Entries in ${monthLabel(r.key)}`} sub={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}, newest first. Open a name for their history.`}
          action={
            <div role="group" aria-label="Show" className="flex gap-1">
              {([["all", "All"], ["out", "Out"], ["in", "Repayments"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                  className={`min-h-9 rounded-full border px-3 text-[13px] font-medium ${kind === k ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-slate-600 hover:text-ink"}`}>{l}</button>
              ))}
            </div>
          } />
        {entries.length ? (
          <ol className="m-0 list-none border-t border-line p-0">
            {entries.map((a) => {
              const sign = a.kind === "repayment" ? 1 : a.kind === "card_own" ? 0 : -1;
              const body = (
                <>
                  <span className="w-14 flex-none text-[12.5px] text-slate-500">{dateShort(a.iso)}</span>
                  <span className="min-w-0 flex-auto">
                    <span className="flex flex-wrap items-center gap-x-2 text-[14px] font-medium">{a.name}<span className="text-[12px] font-normal text-slate-500">{KIND_LABEL[a.kind]}</span></span>
                    <span className="block truncate text-[12.5px] text-slate-500">{a.source} · {a.detail}</span>
                  </span>
                  <Money value={sign * a.amount} signed={sign !== 0} tone={sign > 0 ? "good" : sign < 0 ? "owed" : "ink"} className="flex-none" />
                </>
              );
              return <li key={a.id} className="border-b border-soft last:border-0">{a.personId ? <Link href={`/debtors/${a.personId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-subtle sm:px-5">{body}</Link> : <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">{body}</div>}</li>;
            })}
          </ol>
        ) : <div className="border-t border-line p-4"><EmptyState compact title="No entries">Nothing of this kind was recorded in {monthLabel(r.key)}.</EmptyState></div>}
      </SectionCard>

      <SectionCard labelledBy="all-h">
        <SectionHead id="all-h" title="Every month" sub="Pick a month to see it above." />
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[460px] border-collapse text-[13.5px]">
            <thead><tr className="bg-subtle text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              <th scope="col" className="px-4 py-2.5 sm:px-5">Month</th><th scope="col" className="px-4 py-2.5 text-right">Lent out</th>
              <th scope="col" className="px-4 py-2.5 text-right">Paid back</th><th scope="col" className="px-4 py-2.5 text-right sm:pr-5">Owed at end</th>
            </tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.key} className={`border-t border-soft ${x.key === key ? "bg-good-tint" : ""}`}>
                  <th scope="row" className="px-4 py-1.5 text-left font-medium sm:px-5">
                    <button type="button" onClick={() => setKey(x.key)} aria-current={x.key === key || undefined} className="min-h-8 underline-offset-4 hover:underline">{monthLabel(x.key)}</button>
                  </th>
                  <td className="px-4 py-1.5 text-right"><Money value={sumBy([x.lentLoans, x.lentCard], (v) => v)} tone="muted" /></td>
                  <td className="px-4 py-1.5 text-right"><Money value={sumBy([x.collectedLoans, x.collectedCard], (v) => v)} tone="good" /></td>
                  <td className="px-4 py-1.5 text-right sm:pr-5"><Money value={x.receivablesEnd} tone="owed" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

function Block({ title, total, tone, lines }: { title: string; total: number; tone: "owed" | "good"; lines: [string, number, string?][] }) {
  return (
    <div className="surface-card flex flex-col gap-2 p-4">
      <span className="eyebrow">{title}</span>
      <Money value={total} tone={tone} className="text-figure" />
      <dl className="m-0 flex flex-col gap-1 border-t border-soft pt-2 text-[13px]">
        {lines.map(([k, v, help]) => (
          <div key={k}>
            <div className="flex justify-between gap-3"><dt className="text-slate-600">{k}</dt><dd className="m-0"><Money value={v} tone={v ? "ink" : "muted"} /></dd></div>
            {help && <p className="m-0 text-[11.5px] text-slate-500">{help}</p>}
          </div>
        ))}
      </dl>
    </div>
  );
}

function Mini({ label, value, note }: { label: string; value: number | null; note: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line px-4 py-3">
      <span className="text-[12.5px] font-medium text-slate-600">{label}</span>
      {value != null && <Money value={value} className="text-[17px]" />}
      <span className="text-[12px] text-slate-500">{note}</span>
    </div>
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
