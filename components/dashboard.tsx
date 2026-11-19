"use client";

// Overview sections. Display only: every figure comes from lib/dashboard (tested) or lib/ledger.
// Cash (an asset), money owed to you (a receivable), card balances (a liability) and the projection are separate
// figures and are never added together; each says what it is. Definitions: docs/METRICS.md.

import { useState } from "react";
import Link from "next/link";
import { Avatar, SectionCard, SectionHead, StatusPill } from "@/components/debtors/bits";
import { CardVisual } from "@/components/card-visual";
import { Modal } from "@/components/modal";
import { Button, EmptyState, Money } from "@/components/ui";
import { CountUp } from "@/components/motion";
import { TrendArea } from "@/components/viz";
import type { MonthPoint } from "@/lib/trends";
import { ArrowRightIcon, BankIcon, CardIcon, ChevronRight, DueIcon, InfoIcon, TrendIcon } from "@/components/icons";
import type { Activity, Dashboard, OpenItem } from "@/lib/dashboard";
import { addDays, dateLong, dateShort, initials, taka, timestampLong } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { Status } from "@/lib/types";

/** Long date in English for a YYYY-MM-DD, identical on server and client. */
function longDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
const greeting = (h: number) => (h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");

// ---- Hero: the three numbers that matter, each a way in -------------------------------------------------------

/**
 * The hero deck: today's date and greeting, the bank balance counting up, the two other figures as glass tiles (each a
 * link), the 12-month "owed to you" trend drawing itself in, and the projection — labelled — underneath.
 */
export function Hero({ d, hour, actions, trend }: { d: Dashboard; hour: number; actions: React.ReactNode; trend: MonthPoint[] }) {
  const bank = d.bank;
  const people = new Set(d.open.map((o) => o.personId)).size;
  const t0 = trend[0]?.owedEnd ?? 0, t1 = trend[trend.length - 1]?.owedEnd ?? 0;
  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="eyebrow">{longDate(d.today)}</div>
          <h1 className="m-0 mt-2 font-display text-title font-normal">{greeting(hour)}.</h1>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>
      </div>

      <section aria-label="Your position" className="deck grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          <Link href="#bank" className="group flex w-fit flex-col gap-1 rounded-xl">
            <span className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/60">
              <BankIcon size={14} className="text-[#7DD4B8]" />Cash in {bank?.name ?? "the bank"}
              <ArrowRightIcon size={13} className="transition-transform group-hover:translate-x-0.5" />
            </span>
            {bank ? (
              <span className="money text-[clamp(38px,6vw,60px)] font-medium leading-none tracking-[-0.03em] text-white">
                <CountUp value={bank.balance} format={taka} duration={1400} intro />
              </span>
            ) : <span className="text-figure text-white/60">Not set up</span>}
            <span className="text-[12.5px] text-white/55">{bank ? `The balance you last entered · ${timestampLong(bank.updatedAt)}` : "Add your bank account to start."}</span>
          </Link>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/debtors?show=owing" className="deck-tile group flex flex-col gap-1 p-4 transition-colors">
              <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">Owed to you<ArrowRightIcon size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
              <span className="money text-[26px] leading-tight text-[#F0C77E]"><CountUp value={d.receivables.total} format={taka} duration={1300} intro /></span>
              <span className="text-[12px] text-white/55">{people} {people === 1 ? "person" : "people"} · loans {taka(d.receivables.bankLoans)} · cards {taka(d.receivables.cards)}</span>
              {d.overdue.count > 0 && <span className="text-[12px] font-medium text-[#FFA08F]"><DueIcon size={12} className="mr-1 inline" />{taka(d.overdue.amount)} overdue</span>}
            </Link>
            <Link href="#cards" className="deck-tile group flex flex-col gap-1 p-4 transition-colors">
              <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">You owe on cards<ArrowRightIcon size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
              <span className="money text-[26px] leading-tight text-[#FFA08F]"><CountUp value={d.liabilities.cards} format={taka} duration={1300} intro /></span>
              <span className="text-[12px] text-white/55">{d.cards.length} {d.cards.length === 1 ? "card" : "cards"} · {taka(d.receivables.cards)} is others&apos; purchases</span>
            </Link>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-3">
          <TrendArea dark color="#E8C27A" title="Owed to you · last 12 months"
            points={trend.map((p) => ({ key: p.key, label: p.label, short: p.short, value: p.owedEnd }))} />
          <p className="m-0 text-[12px] text-white/55">
            {t1 >= t0 ? "Up" : "Down"} <b className="font-semibold text-white/85">{taka(t1 - t0)}</b> since {trend[0]?.label}. Built from dated loans, card purchases and repayments.
          </p>
        </div>

        {d.projection && (
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/10 pt-4 text-[12.5px] text-white/65 lg:col-span-2">
            <span className="rounded-full border border-[#92B5E8]/40 bg-[#92B5E8]/10 px-2 py-0.5 text-[11px] font-semibold text-[#B9D0F2]">Projection</span>
            If every bank loan were repaid, {bank?.name ?? "the bank"} would hold <b className="money font-medium text-white">{taka(d.projection.bankAfterLoans)}</b>
            <span className="text-white/45">— not money you have today; card repayments go to the cards, not the bank.</span>
          </p>
        )}
      </section>
    </header>
  );
}

// ---- Needs attention: overdue and upcoming installments, with the action next to each ---------------------------

/** Same person, date and source → one row (two purchases due the same day read as one payment). */
function groupDue(items: OpenItem[]) {
  const map = new Map<string, OpenItem & { count: number }>();
  for (const o of items) {
    const k = `${o.personId}|${o.iso}|${o.source}|${o.cardId}`;
    const g = map.get(k);
    if (g) { g.left = sumBy([g.left, o.left], (x) => x); g.count++; g.emi = g.emi || o.emi; }
    else map.set(k, { ...o, count: 1 });
  }
  return [...map.values()];
}

export function Attention({ d, cardName, onRepay, canAct }: {
  d: Dashboard; cardName: (id: string | null) => string; onRepay: (personId: string) => void; canAct: boolean;
}) {
  const horizon = addDays(d.today, 14);
  const items = groupDue(d.open.filter((o) => o.iso && (o.status === "overdue" || o.iso <= horizon)));
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 7);
  const bills = d.cards.filter((c) => c.payByPassed);
  const total = sumBy(items, (o) => o.left);

  return (
    <SectionCard labelledBy="att-h">
      <SectionHead id="att-h" title="Needs attention"
        sub={items.length ? `${items.length} ${items.length === 1 ? "payment" : "payments"} overdue or due in the next 14 days · ${taka(total)}` : "Overdue repayments and installments due in the next 14 days."}
        action={<Link href="/repayments" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-brand-2 hover:bg-good-tint">All repayments<ChevronRight size={15} /></Link>} />
      {bills.map((c) => (
        <Link key={c.card.id} href={`/cards/${c.card.slot}`} className="flex items-center gap-3 border-t border-line bg-bad-tint/50 px-4 py-2.5 text-[13px] hover:bg-bad-tint sm:px-5">
          <CardIcon size={16} className="flex-none text-bad" />
          <span className="min-w-0 flex-auto"><b className="font-medium text-bad-deep">{c.label}: pay-by date passed</b>
            <span className="block text-[12.5px] text-slate-600">Set to {dateLong(c.payBy)}. Update it from your new statement.</span></span>
          <Money value={c.balance} tone="bad" />
        </Link>
      ))}
      {shown.length ? (
        <ul className="m-0 list-none border-t border-line p-0">
          {shown.map((o) => {
            const late = o.status === "overdue";
            return (
              <li key={o.key} className="flex items-center gap-3 border-b border-soft px-4 py-2.5 last:border-0 sm:px-5">
                <span className={`w-[76px] flex-none text-[12.5px] ${late ? "font-semibold text-bad" : "font-medium"}`}>
                  {late && <DueIcon size={12} className="mr-1 inline" />}{dateShort(o.iso)}
                  <span className="block text-[11.5px] font-normal text-slate-500">{late ? "Overdue" : o.status === "week" ? "This week" : "Next week"}</span>
                </span>
                <Link href={`/debtors/${o.personId}`} className="flex min-w-0 flex-auto items-center gap-2.5 rounded-lg hover:text-brand-ink">
                  <Avatar text={initials(o.name)} size={30} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{o.name}</span>
                    <span className="block truncate text-[12px] text-slate-500">{o.source === "loan" ? "Bank loan" : cardName(o.cardId)}{o.emi ? " · EMI installment" : ""}{o.count > 1 ? ` · ${o.count} items` : ""}</span>
                  </span>
                </Link>
                <Money value={o.left} tone={late ? "bad" : "owed"} className="flex-none text-[14px]" />
                {canAct && <Button size="sm" variant="secondary" onClick={() => onRepay(o.personId)} className="flex-none max-sm:px-2.5" aria-label={`Record a repayment from ${o.name}`}><TrendIcon size={14} /><span className="max-sm:hidden">Record</span></Button>}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="border-t border-line p-4"><EmptyState compact title="Nothing due in the next 14 days">{d.undated.count ? `${taka(d.undated.amount)} is owed with no due date set.` : "No overdue repayments either."}</EmptyState></div>
      )}
      {items.length > 7 && (
        <div className="border-t border-line p-2 text-center"><Button variant="ghost" size="sm" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${items.length}`}</Button></div>
      )}
    </SectionCard>
  );
}

// ---- Credit cards -----------------------------------------------------------------------------------------------

export function CardsStrip({ d }: { d: Dashboard }) {
  if (!d.cards.length) return null;
  return (
    <section aria-labelledby="cards-h" id="cards" className="flex scroll-mt-20 flex-col gap-3">
      <h2 id="cards-h" className="m-0 text-heading font-semibold">Credit cards</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {d.cards.map((c) => (
          <Link key={c.card.id} href={`/cards/${c.card.slot}`} className="surface-card lift group grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] items-center gap-4 p-4 sm:grid-cols-[150px_minmax(0,1fr)]">
            <CardVisual card={c.card} size="sm" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center justify-between gap-2 text-[14px] font-semibold"><span className="truncate">{c.label}</span><ArrowRightIcon size={15} className="flex-none text-slate-400 transition-transform group-hover:translate-x-0.5" /></span>
              <span className="eyebrow mt-1">You owe</span>
              <Money value={c.balance} tone="bad" className="text-[22px] leading-tight" />
              <span className="text-[12.5px] text-slate-500">
                Others owe you <Money value={c.othersOwe} tone="owed" />
                {c.payBy && <span className={`block ${c.payByPassed ? "font-medium text-bad" : ""}`}>Pay by {dateLong(c.payBy)}{c.payByPassed ? " · passed" : ""}</span>}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---- Recent activity ----------------------------------------------------------------------------------------------

const ACT: Record<Activity["kind"], { label: string; sign: 1 | -1 | 0 }> = {
  loan: { label: "Loan", sign: -1 },
  card_other: { label: "Card purchase", sign: -1 },
  card_own: { label: "Your card spending", sign: 0 },
  repayment: { label: "Repayment", sign: 1 },
};

export function RecentActivity({ d }: { d: Dashboard }) {
  const rows = d.activity.slice(0, 8);
  return (
    <SectionCard labelledBy="act-h">
      <SectionHead id="act-h" title="Recent activity" sub="The latest loans, card purchases and repayments."
        action={<Link href="/reports" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-brand-2 hover:bg-good-tint">Monthly summary<ChevronRight size={15} /></Link>} />
      {rows.length ? (
        <ol className="m-0 list-none border-t border-line p-0">
          {rows.map((a) => {
            const m = ACT[a.kind];
            const inner = (
              <>
                <span className="min-w-0 flex-auto">
                  <span className="flex flex-wrap items-center gap-x-2 text-[14px] font-medium">{a.name}<span className="text-[12px] font-normal text-slate-500">{m.label}</span></span>
                  <span className="block truncate text-[12.5px] text-slate-500">{dateShort(a.iso)} · {a.source} · {a.detail}</span>
                </span>
                <span className="flex flex-none flex-col items-end gap-0.5">
                  <Money value={m.sign * a.amount} signed={m.sign !== 0} tone={m.sign > 0 ? "good" : m.sign < 0 ? "owed" : "ink"} className="text-[14px]" />
                  <span className="text-[11.5px] text-slate-500">{a.status}</span>
                </span>
              </>
            );
            return (
              <li key={a.id} className="border-b border-soft last:border-0">
                {a.personId ? <Link href={`/debtors/${a.personId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-subtle sm:px-5">{inner}</Link>
                  : <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">{inner}</div>}
              </li>
            );
          })}
        </ol>
      ) : <div className="border-t border-line p-5"><EmptyState compact title="Nothing recorded yet">Loans, card purchases and repayments appear here as you add them.</EmptyState></div>}
    </SectionCard>
  );
}

// ---- Record repayment: pick who paid --------------------------------------------------------------------------------

export function RepayPicker({ people, onPick, onClose }: {
  people: { id: string; name: string; owes: number; status: Status }[]; onPick: (id: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal title="Record a repayment" onClose={onClose} maxWidth={460}>
      <div className="flex flex-col gap-3 p-5">
        <p className="m-0 text-[13.5px] text-slate-500">Who paid you? Next you choose the loan or card it&apos;s for, and whether it goes into the bank.</p>
        <label className="field-label">
          Search
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name" className="field-input" data-autofocus />
        </label>
        <ul className="m-0 flex max-h-[50dvh] list-none flex-col overflow-y-auto p-0">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p.id)} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-soft">
                <Avatar text={initials(p.name)} size={30} />
                <span className="min-w-0 flex-auto truncate text-[14px] font-medium">{p.name}</span>
                <StatusPill status={p.status} className="max-[380px]:hidden" />
                <Money value={p.owes} tone="owed" className="w-[88px] text-right text-[13.5px]" />
              </button>
            </li>
          ))}
          {!list.length && <li className="px-2 py-4 text-[13.5px] text-slate-500">Nobody matches — or nobody owes you anything.</li>}
        </ul>
      </div>
    </Modal>
  );
}

export function NoteLine({ children }: { children: React.ReactNode }) {
  return <p className="m-0 flex gap-2 text-[12.5px] text-slate-500"><InfoIcon size={14} className="mt-0.5 flex-none" />{children}</p>;
}
