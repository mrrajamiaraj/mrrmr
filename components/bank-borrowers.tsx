"use client";

// The City Bank account's lending ledger, set out like a card page:
//   • Balance outlook — the balance now, the balance once everyone has paid back into the account, and a waterfall of
//     how it gets there in due-date order (overdue first, then each date, then loans with no date);
//   • Who took money — every person with a loan from this account, what they took, paid back and still owe, what the
//     balance becomes when they repay, a Record button, and their loan statement with a running total.
// Figures: lib/bank (bankBorrowers, bankOutlook, loanLedger — tested), lib/ledger profiles, lib/dashboard open items.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar, SectionCard, SectionHead } from "@/components/debtors/bits";
import { RepayPicker } from "@/components/dashboard";
import { Badge, Button, EmptyState, Money } from "@/components/ui";
import { BankIcon, ChevronDown, InIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { CountUp, stagger } from "@/components/motion";
import { DateChip, HUES, SplitBar } from "@/components/viz";
import { bankBorrowers, bankOutlook, loanLedger, type OutlookStep } from "@/lib/bank";
import type { OpenItem } from "@/lib/dashboard";
import type { Profile } from "@/lib/ledger";
import { dateLong, dateShort, initials, taka } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { FinanceData } from "@/lib/types";

type Sort = "taken" | "owes" | "recent" | "name";

export function BankBorrowers({ data, accountId, accountName, balance, open, profiles, today, viewer, onRepay, onAdd }: {
  data: FinanceData; accountId: string; accountName: string; balance: number; open: OpenItem[]; profiles: Profile[]; today: string;
  viewer: boolean; onRepay: (personId: string) => void; onAdd: () => void;
}) {
  const rows = useMemo(() => {
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return bankBorrowers(data, accountId).map((b) => ({ ...b, p: byId.get(b.personId) }));
  }, [data, accountId, profiles]);
  const outlook = useMemo(() => bankOutlook(balance, open, rows.map((r) => r.personId), today), [balance, open, rows, today]);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("taken");
  const [owingOnly, setOwingOnly] = useState(false);
  const [picking, setPicking] = useState(false);

  const taken = sumBy(rows, (r) => r.taken);
  const back = sumBy(rows, (r) => r.creditedBack);
  const stillOwed = sumBy(rows, (r) => r.p?.loanOut ?? 0);
  const owingRows = rows.filter((r) => (r.p?.loanOut ?? 0) > 0);
  const ql = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => (!owingOnly || (r.p?.loanOut ?? 0) > 0) && (!ql || `${r.name} ${r.relation ?? ""} ${r.phone ?? ""} ${r.loans.map((l) => l.reason).join(" ")}`.toLowerCase().includes(ql)))
    .sort((a, b) => sort === "owes" ? (b.p?.loanOut ?? 0) - (a.p?.loanOut ?? 0) : sort === "recent" ? b.last.localeCompare(a.last) : sort === "name" ? a.name.localeCompare(b.name) : b.taken - a.taken);
  const maxTaken = Math.max(1, ...rows.map((r) => r.taken));
  const top = rows.slice(0, 8);

  const actions = !viewer && (
    <div className="flex flex-wrap gap-2">
      {owingRows.length > 0 && <Button size="sm" onClick={() => setPicking(true)} className="shine"><InIcon size={14} />Record repayment</Button>}
      <Button size="sm" variant="secondary" onClick={onAdd}><PlusIcon size={14} />Lend money</Button>
    </div>
  );

  return (
    <SectionCard labelledBy="borrowers-h">
      <SectionHead id="borrowers-h" title={`Who took money from ${accountName}`} action={actions}
        sub="Like a card statement: who took money from the account, what they've paid back, and what the balance becomes when they repay." />

      {rows.length ? (
        <>
          <Outlook outlook={outlook} accountName={accountName} today={today} />

          <div className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-4">
            {([["People", rows.length, null, `${owingRows.length} still owe on loans`], ["Taken from the account", taken, "owed", `${sumBy(rows, (r) => r.loans.length)} loans`],
              ["Paid back into it", back, "good", "repayments credited to the balance"], ["Still owed on loans", stillOwed, "bad", "across all their loans"]] as const).map(([label, v, tone, note], i) => (
              <div key={label} style={stagger(i, 70)} className="flex animate-fade-up flex-col gap-1 bg-surface px-4 py-3.5 sm:px-5">
                <span className="eyebrow">{label}</span>
                <span className={`money text-[22px] leading-tight ${tone === "owed" ? "text-owed" : tone === "good" ? "text-brand-2" : tone === "bad" ? "text-bad" : ""}`}>
                  {tone ? <CountUp value={v} format={taka} /> : <CountUp value={v} format={(n) => String(Math.round(n))} />}
                </span>
                <span className="text-[12px] text-slate-500">{note}</span>
              </div>
            ))}
          </div>

          {/* Who took the most: one bar split per person (biggest eight), names and amounts written beside it. */}
          <div className="flex flex-col gap-2.5 px-4 py-4 sm:px-5">
            <div aria-hidden="true" className="flex h-3.5 w-full gap-[3px] overflow-hidden rounded-full">
              {top.map((r, i) => (
                <span key={r.personId} title={`${r.name} ${taka(r.taken)}`} className="bar-fill h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(r.taken / taken) * 100}%`, background: HUES[i % HUES.length], animationDelay: `${i * 70}ms` }} />
              ))}
              {rows.length > top.length && <span className="bar-fill h-full rounded-r-full bg-slate-400" style={{ width: `${(sumBy(rows.slice(top.length), (r) => r.taken) / taken) * 100}%` }} />}
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12.5px]">
              {top.map((r, i) => (
                <li key={r.personId} className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: HUES[i % HUES.length] }} />
                  <span className="font-medium">{r.name}</span><span className="money text-slate-500">{taka(r.taken)}</span>
                </li>
              ))}
              {rows.length > top.length && <li className="text-slate-500">+{rows.length - top.length} more</li>}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
            <label className="flex min-h-10 min-w-0 flex-[1_1_220px] items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:border-brand-2">
              <SearchIcon size={15} className="text-slate-500" /><span className="sr-only">Search people who took money</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="min-w-0 flex-auto bg-transparent text-[14px] outline-none" />
            </label>
            <button type="button" aria-pressed={owingOnly} onClick={() => setOwingOnly((v) => !v)}
              className={`min-h-10 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${owingOnly ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-slate-600 hover:text-ink"}`}>Still owe</button>
            <label className="flex items-center gap-1.5 text-[13px] text-slate-500">Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-10 rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px] text-ink">
                <option value="taken">Most taken</option><option value="owes">Still owe most</option><option value="recent">Most recent</option><option value="name">Name (A–Z)</option>
              </select>
            </label>
          </div>

          <ul className="m-0 list-none border-t border-line p-0">
            {shown.map((r, i) => {
              const p = r.p;
              const isOpen = openRow === r.personId;
              const owes = p?.loanOut ?? 0;
              const repaid = p?.paidLoan ?? 0;
              const late = owes > 0 && p?.dueKind === "late";
              const first = r.name.split(" ")[0];
              return (
                <li key={r.personId} style={stagger(i, 35, 420)} className="animate-fade-up border-b border-soft last:border-0">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_auto_auto]">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar text={initials(r.name)} size={40} />
                      <div className="min-w-0">
                        <Link href={`/debtors/${r.personId}`} className="block truncate text-[15px] font-medium hover:text-brand-ink hover:underline">{r.name}</Link>
                        <span className="block truncate text-[12px] text-slate-500">
                          {[r.relation, r.phone].filter(Boolean).join(" · ") || `${r.loans.length} ${r.loans.length === 1 ? "loan" : "loans"}`} · last {dateLong(r.last)}
                        </span>
                      </div>
                    </div>
                    <span className="text-right md:hidden"><Money value={owes} tone={owes ? (late ? "bad" : "owed") : "good"} className="text-[15px]" /></span>
                    <div className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
                      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                        <span><span className="text-slate-500">Taken </span><Money value={r.taken} tone="owed" /></span>
                        {owes > 0 ? <span className={late ? "font-medium text-bad" : "text-slate-600"}>owes <Money value={owes} tone={late ? "bad" : "ink"} /></span> : <Badge tone="good" className="text-[11px]">Loans repaid</Badge>}
                      </div>
                      <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-soft max-md:hidden">
                        <span className="bar-fill block h-full rounded-full bg-owed-bar" style={{ width: `${(r.taken / maxTaken) * 100}%`, animationDelay: `${Math.min(i * 35, 420) + 120}ms` }} />
                      </span>
                      {repaid + owes > 0 && <SplitBar className="h-1.5" parts={[{ value: repaid, className: "bg-brand-2" }, { value: owes, className: late ? "bg-bad/70" : "bg-owed-bar/50" }]} />}
                      {owes > 0 && (
                        <span className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-slate-500">
                          <BankIcon size={12} className="text-brand-2" />When {first} repays: {accountName}
                          <Money value={balance} tone="muted" /> → <Money value={balance + owes} tone="good" />
                        </span>
                      )}
                    </div>
                    <span className="max-md:hidden">{owes > 0 && p?.due ? <DateChip iso={p.due} today={today} size="sm" /> : <span className="text-[12px] text-slate-400">—</span>}</span>
                    <div className={`col-span-2 flex gap-2 md:col-span-1 ${owes > 0 ? "" : "max-md:-mt-1 max-md:justify-end"}`}>
                      {!viewer && owes > 0 && <Button size="sm" onClick={() => onRepay(r.personId)} className="flex-auto md:flex-none" aria-label={`Record a repayment from ${r.name}`}><InIcon size={14} />Record</Button>}
                      <button type="button" aria-expanded={isOpen} aria-controls={`bb-${r.personId}`} onClick={() => setOpenRow(isOpen ? null : r.personId)}
                        className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-slate-600 hover:bg-soft hover:text-ink md:flex-none ${owes > 0 ? "flex-auto" : "max-md:min-h-8 max-md:border-transparent max-md:px-2 max-md:text-brand-2"}`}>
                        {isOpen ? "Hide" : "Statement"}<ChevronDown size={14} className={`transition-transform duration-300 ease-[var(--ease-spring)] ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>
                  {isOpen && <Statement data={data} personId={r.personId} accountId={accountId} accountName={accountName} first={first} name={r.name} balance={balance} owes={owes} creditedBack={r.creditedBack} />}
                </li>
              );
            })}
            {!shown.length && <li className="p-5 text-center text-[13.5px] text-slate-500">Nobody matches.</li>}
          </ul>
        </>
      ) : (
        <div className="border-t border-line p-5">
          <EmptyState compact title="Nobody has taken money from this account yet"
            action={!viewer ? <Button size="sm" onClick={onAdd}><PlusIcon size={14} />Lend money</Button> : undefined}>
            When you lend money from {accountName}, the person appears here with every loan, their repayments, and what the balance becomes when they pay back.
          </EmptyState>
        </div>
      )}

      {picking && (
        <RepayPicker people={owingRows.map((r) => ({ id: r.personId, name: r.name, owes: r.p?.loanOut ?? 0, status: r.p!.status }))}
          onClose={() => setPicking(false)} onPick={(id) => { setPicking(false); onRepay(id); }} />
      )}
    </SectionCard>
  );
}

// ---- Balance outlook ------------------------------------------------------------------------------------------------

const MAX_STEPS = 8;
const stepLabel = (s: OutlookStep, today: string) => (s.kind === "overdue" ? "Overdue" : s.kind === "undated" ? "No date" : s.iso === today ? "Today" : dateShort(s.iso));

/**
 * Waterfall: the balance now, one floating bar per repayment step (in due-date order), and the balance after.
 * Hover, focus or ←/→ reads a step; the list underneath says the same in words.
 */
function Outlook({ outlook, accountName, today }: { outlook: ReturnType<typeof bankOutlook>; accountName: string; today: string }) {
  const steps = useMemo(() => {
    if (outlook.steps.length <= MAX_STEPS) return outlook.steps;
    const head = outlook.steps.slice(0, MAX_STEPS - 1), rest = outlook.steps.slice(MAX_STEPS - 1);
    const people = new Map<string, { personId: string; name: string; amount: number }>();
    for (const p of rest.flatMap((s) => s.people)) { const x = people.get(p.personId); people.set(p.personId, x ? { ...x, amount: sumBy([x.amount, p.amount], (v) => v) } : { ...p }); }
    return [...head, { kind: "dated" as const, iso: null, amount: sumBy(rest, (s) => s.amount), balance: outlook.after, people: [...people.values()].sort((a, b) => b.amount - a.amount), later: true }];
  }, [outlook]);
  const [hover, setHover] = useState<number | null>(null);
  const cols = steps.length + 2; // now + steps + after
  const gain = outlook.expected;
  // The axis starts below "now" so the repayment bars are visible next to a large balance; it's written on the chart.
  const lo = gain > 0 ? Math.max(0, Math.floor(outlook.now - gain * 1.2)) : 0;
  const hi = Math.max(1, outlook.after) - lo;
  const h = (v: number) => `${Math.max(((v - lo) / hi) * 100, 0)}%`;
  const label = (i: number) => (i === 0 ? "Now" : i === cols - 1 ? "After" : "later" in steps[i - 1] ? "Later" : stepLabel(steps[i - 1], today));
  const cur = hover == null ? null : hover === 0 ? { title: `${accountName} now`, value: outlook.now, add: 0, who: "" }
    : hover === cols - 1 ? { title: "Once everyone has paid back", value: outlook.after, add: gain, who: "" }
    : (() => { const s = steps[hover - 1]; return { title: s.kind === "overdue" ? "Overdue — could come in any time" : s.kind === "undated" ? "Loans with no pay-back date" : "later" in s ? "Later dates" : dateLong(s.iso), value: s.balance, add: s.amount, who: s.people.map((p) => p.name).join(", ") }; })();
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover((x) => Math.max(0, (x ?? 1) - 1)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setHover((x) => Math.min(cols - 1, (x ?? -1) + 1)); }
  };
  const pct = outlook.now > 0 ? Math.round((gain / outlook.now) * 1000) / 10 : null;

  return (
    <div className="grid gap-5 border-t border-line px-4 py-5 sm:px-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
      <div className="flex flex-col gap-4">
        <div className="flex items-stretch gap-3">
          <div className="flex flex-1 flex-col gap-1 rounded-xl border border-line bg-subtle p-3.5">
            <span className="eyebrow">In {accountName} now</span>
            <span className="money text-[24px] leading-tight"><CountUp value={outlook.now} format={taka} /></span>
            <span className="text-[12px] text-slate-500">the balance you keep up to date</span>
          </div>
          <span aria-hidden="true" className="grid place-items-center text-[20px] text-slate-400">→</span>
          <div className="flex flex-1 flex-col gap-1 rounded-xl border border-good-line bg-good-tint p-3.5">
            <span className="eyebrow text-brand-ink">After everyone pays back</span>
            <span className="money text-[24px] leading-tight text-brand-2"><CountUp value={outlook.after} format={taka} /></span>
            <span className="text-[12px] text-slate-600">+{taka(gain)}{pct != null && gain > 0 ? ` (+${pct}%)` : ""} still to come in</span>
          </div>
        </div>
        {gain > 0 ? (
          <ol className="m-0 flex max-h-[260px] list-none flex-col overflow-y-auto rounded-xl border border-line p-0">
            {steps.map((s, i) => (
              <li key={`${s.kind}${s.iso}${i}`} style={stagger(i, 45)} onPointerEnter={() => setHover(i + 1)} onPointerLeave={() => setHover(null)}
                className={`flex animate-fade-up items-center gap-3 border-b border-soft px-3 py-2 text-[13px] transition-colors last:border-0 ${hover === i + 1 ? "bg-subtle" : ""}`}>
                {s.kind === "dated" && s.iso ? <DateChip iso={s.iso} today={today} size="sm" />
                  : <span className={`inline-flex min-w-[64px] justify-center rounded-md px-1.5 py-1 text-[11px] font-semibold ${s.kind === "overdue" ? "bg-bad-tint text-bad" : "bg-soft text-slate-600"}`}>{"later" in s ? "Later" : s.kind === "overdue" ? "Overdue" : "No date"}</span>}
                <span className="min-w-0 flex-auto truncate">{s.people.map((p) => p.name).join(", ")}</span>
                <span className="flex flex-none flex-col items-end leading-tight">
                  <Money value={s.amount} tone="good" signed className="text-[13px]" />
                  <span className="text-[11px] text-slate-500">→ {taka(s.balance)}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : <p className="m-0 text-[13px] text-slate-500">Nobody owes anything on loans from this account, so the balance stays as it is.</p>}
      </div>

      <figure className="m-0 flex min-w-0 flex-col gap-2">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
          <span className="font-semibold">How the balance grows as people pay back</span>
          <span aria-live="polite" className="min-h-5 text-slate-500">
            {cur ? <><b className="font-semibold text-ink">{cur.title}</b>{cur.add ? <> · <span className="money text-brand-2">+{taka(cur.add)}</span></> : null} · balance <span className="money text-ink">{taka(cur.value)}</span>{cur.who ? ` · ${cur.who}` : ""}</>
              : "Assumes each repayment goes into the account. Tap a bar to read it."}
          </span>
        </figcaption>
        <div tabIndex={0} role="group" aria-label={`${accountName} balance now ${taka(outlook.now)}; after every loan is paid back into it, ${taka(outlook.after)}. Use the arrow keys to read each step.`}
          onKeyDown={onKey} onBlur={() => setHover(null)} onPointerLeave={() => setHover(null)}
          className="relative grid h-[210px] items-end gap-1.5 rounded-lg outline-offset-4 sm:gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {[0.25, 0.5, 0.75].map((g) => <span key={g} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${g * 100}%` }} />)}
          {Array.from({ length: cols }, (_, i) => {
            const isEnd = i === 0 || i === cols - 1;
            const value = i === 0 ? outlook.now : i === cols - 1 ? outlook.after : steps[i - 1].balance;
            const prev = i === 0 || i === cols - 1 ? lo : i === 1 ? outlook.now : steps[i - 2].balance;
            const s = !isEnd ? steps[i - 1] : null;
            const on = hover === i;
            return (
              <span key={i} onPointerEnter={() => setHover(i)} className={`relative flex h-full flex-col justify-end rounded-md transition-colors ${on ? "bg-subtle" : ""}`}>
                {on && <span className="absolute inset-x-0 z-10 animate-pop-in text-center text-[10px] font-semibold tabular-nums" style={{ bottom: `calc(${h(value)} + 3px)` }}>{taka(isEnd ? value : s!.amount)}</span>}
                <span aria-hidden="true" className="absolute inset-x-[10%] viz-grow rounded-[5px] transition-[filter,opacity] duration-200"
                  style={{
                    bottom: isEnd ? 0 : h(prev), height: isEnd ? h(value) : `calc(${h(value)} - ${h(prev)})`, minHeight: 3, animationDelay: `${i * 70}ms`,
                    background: i === 0 ? "var(--color-slate-400)" : i === cols - 1 ? "linear-gradient(var(--color-brand-2), color-mix(in srgb, var(--color-brand-2) 55%, transparent))" : s!.kind === "overdue" ? "var(--color-bad)" : s!.kind === "undated" ? "var(--color-slate-500)" : "var(--color-chart-in)",
                    opacity: hover != null && !on ? 0.5 : 1,
                  }} />
                {/* connector to the next bar's start */}
                {i < cols - 1 && <span aria-hidden="true" className="pointer-events-none absolute -right-[4px] left-[90%] border-t border-dashed border-slate-400" style={{ bottom: h(value) }} />}
              </span>
            );
          })}
        </div>
        <div aria-hidden="true" className="grid gap-1.5 text-[10.5px] text-slate-500 sm:gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, i) => <span key={i} className={`truncate text-center ${hover === i ? "font-semibold text-ink" : ""}`}>{label(i)}</span>)}
        </div>
        {lo > 0 && <span className="text-[11px] text-slate-500">The scale starts at {taka(lo)} so each repayment is visible.</span>}
      </figure>
    </div>
  );
}

// ---- One person's loan statement --------------------------------------------------------------------------------------

function Statement({ data, personId, accountId, accountName, first, name, balance, owes, creditedBack }: {
  data: FinanceData; personId: string; accountId: string; accountName: string; first: string; name: string; balance: number; owes: number; creditedBack: number;
}) {
  const lines = useMemo(() => loanLedger(data, personId, accountId).reverse(), [data, personId, accountId]);
  return (
    <div id={`bb-${personId}`} className="animate-fade-in border-t border-soft bg-subtle/60 px-4 py-3 sm:px-5">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 [&>:last-child]:col-span-2 sm:[&>:last-child]:col-span-1">
        <div className="rounded-lg border border-line bg-surface px-3 py-2"><span className="eyebrow">Paid back into {accountName}</span><div><Money value={creditedBack} tone="good" className="text-[16px]" /></div></div>
        <div className="rounded-lg border border-line bg-surface px-3 py-2"><span className="eyebrow">Still owes on loans</span><div><Money value={owes} tone={owes ? "bad" : "good"} className="text-[16px]" /></div></div>
        <div className="rounded-lg border border-good-line bg-good-tint px-3 py-2"><span className="eyebrow text-brand-ink">{accountName} after {first} repays</span>
          <div className="text-[13px] text-slate-600"><Money value={balance} tone="muted" /> → <Money value={balance + owes} tone="good" className="text-[16px]" /></div></div>
      </div>
      <div className="overflow-x-auto">
        <table className="stack-table w-full min-w-[600px] border-collapse text-[13.5px]">
          <caption className="sr-only">{name}&apos;s loans and loan repayments, newest first</caption>
          <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            <th scope="col" className="py-1.5 pr-3">Date</th><th scope="col" className="py-1.5 pr-3">What</th><th scope="col" className="py-1.5 pr-3">{accountName}</th>
            <th scope="col" className="py-1.5 pr-3 text-right">Amount</th><th scope="col" className="py-1.5 text-right">Owes after</th>
          </tr></thead>
          <tbody>
            {lines.map((l, k) => (
              <tr key={l.id} style={stagger(k, 35, 350)} className="animate-fade-up border-t border-line">
                <td className="whitespace-nowrap py-2 pr-3">{dateLong(l.iso)}</td>
                <td data-label="What" className="py-2 pr-3">
                  <span className={`mr-1.5 inline-block rounded px-1.5 py-px text-[10.5px] font-semibold uppercase ${l.kind === "loan" ? "bg-owed-tint text-owed" : "bg-good-tint text-brand-ink"}`}>{l.kind === "loan" ? "Took" : "Paid back"}</span>{l.detail}
                </td>
                <td data-label={accountName} className="py-2 pr-3 text-[12.5px] text-slate-600">
                  {l.kind === "loan" ? (l.viaAccount ? "From the account" : "Other source") : l.viaAccount ? <span className="text-brand-2">Into the account</span> : "Kept as cash / other"}
                </td>
                <td data-label="Amount" className="py-2 pr-3 text-right"><Money value={l.kind === "loan" ? l.amount : -l.amount} tone={l.kind === "loan" ? "owed" : "good"} signed /></td>
                <td data-label="Owes after" className="py-2 text-right"><Money value={l.owes} tone={l.owes > 0 ? "ink" : "good"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href={`/debtors/${personId}`} className="mt-2 inline-block text-[13px] font-medium text-brand-2 underline underline-offset-2">Open {first}&apos;s full profile</Link>
    </div>
  );
}
