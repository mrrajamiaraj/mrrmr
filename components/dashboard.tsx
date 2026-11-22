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
import { DateChip, TrendArea } from "@/components/viz";
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
        {/* Phones: three equal app-style buttons, icon above label, in one row. */}
        <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap [&>*]:max-sm:h-[60px] [&>*]:max-sm:flex-col [&>*]:max-sm:gap-1 [&>*]:max-sm:px-1 [&>*]:max-sm:text-[12.5px] [&>*]:max-sm:leading-tight">{actions}</div>
      </div>

      <section aria-label="Your position" className="deck grid gap-5 p-4 sm:gap-6 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
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

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
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
          <TrendArea dark color="#E8C27A" title={`Owed to you · last ${trend.length} months`}
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
              <span className="mt-1 grid grid-cols-2 gap-3">
                <span className="flex flex-col"><span className="eyebrow">You owe</span><Money value={c.balance} tone="bad" className="text-[20px] leading-tight" /></span>
                <span className="flex flex-col"><span className="eyebrow">Available</span>{c.available != null ? <Money value={c.available} tone="good" className="text-[20px] leading-tight" /> : <span className="text-[20px] text-slate-400">—</span>}</span>
              </span>
              <span className="text-[12.5px] text-slate-500">
                Others owe you <Money value={c.othersOwe} tone="owed" /> · Me <Money value={Math.max(c.myShare, 0)} />
                {c.payBy && <span className={`block ${c.payByPassed ? "font-medium text-bad" : ""}`}>Pay by {dateLong(c.payBy)}{c.payByPassed ? " · passed" : ""}</span>}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---- Record repayment: pick who paid --------------------------------------------------------------------------------

export type RepaySource = {
  /** "loan" for the bank account, or a card id (matches RepayTarget.key) */
  key: string; label: string; kind: "bank" | "card"; sub: string;
  people: { id: string; name: string; owes: number; status: Status }[];
};

export function RepayPicker({ people, sources, onPick, onClose }: {
  people: { id: string; name: string; owes: number; status: Status }[];
  /** When given, the first step asks where the money was owed: the bank account or one of the cards. */
  sources?: RepaySource[];
  onPick: (id: string, sourceKey?: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<RepaySource | null>(null);
  const choosing = !!sources && !src;
  const pool = src ? src.people : people;
  const list = pool.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  if (choosing) {
    return (
      <Modal title="Record a repayment" onClose={onClose} maxWidth={460}>
        <div className="flex flex-col gap-3 p-5">
          <p className="m-0 text-[13.5px] text-slate-500">What is the repayment for?</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {sources!.map((s) => {
              const total = sumBy(s.people, (p) => p.owes);
              const none = !s.people.length;
              return (
                <li key={s.key}>
                  <button type="button" disabled={none} onClick={() => { setSrc(s); setQ(""); }} data-autofocus={s === sources![0] || undefined}
                    className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-line bg-surface px-3.5 text-left transition-colors hover:border-line-strong hover:bg-soft disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-surface">
                    <span className={`grid size-10 flex-none place-items-center rounded-lg ${s.kind === "bank" ? "bg-good-tint text-brand-2" : "bg-owed-tint text-owed"}`}>
                      {s.kind === "bank" ? <BankIcon size={18} /> : <CardIcon size={18} />}
                    </span>
                    <span className="min-w-0 flex-auto">
                      <span className="block truncate text-[14.5px] font-medium">{s.label}</span>
                      <span className="block truncate text-[12px] text-slate-500">
                        {none ? "Nobody owes on this" : `${s.people.length} ${s.people.length === 1 ? "person owes" : "people owe"} · ${s.sub}`}
                      </span>
                    </span>
                    {!none && <Money value={total} tone="owed" className="text-[14px]" />}
                    {!none && <ChevronRight size={16} className="flex-none text-slate-400" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={src ? `Repayment — ${src.label}` : "Record a repayment"} onClose={onClose} maxWidth={460}>
      <div className="flex flex-col gap-3 p-5">
        {src ? (
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-[13.5px] text-slate-500">Who paid you back?</p>
            <button type="button" onClick={() => { setSrc(null); setQ(""); }} className="min-h-9 rounded-lg px-2 text-[13px] font-medium text-brand-2 hover:bg-soft">← Change</button>
          </div>
        ) : <p className="m-0 text-[13.5px] text-slate-500">Who paid you? Next you choose the loan or card it&apos;s for, and whether it goes into the bank.</p>}
        <label className="field-label">
          Search
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name" className="field-input" data-autofocus />
        </label>
        <ul className="m-0 flex max-h-[50dvh] list-none flex-col overflow-y-auto p-0">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p.id, src?.key)} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-soft">
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
