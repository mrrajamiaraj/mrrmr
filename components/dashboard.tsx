"use client";

// Overview dashboard sections. Display only: every figure comes from lib/dashboard (tested) or lib/ledger.
// Each figure is labelled with its kind — Asset, Receivable, Liability, Projection — and a visible one-line definition;
// full definitions are in docs/METRICS.md.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Avatar, SectionCard, SectionHead, StatusPill } from "@/components/debtors/bits";
import { FlowChart, Ring, type Flow } from "@/components/charts";
import { Modal } from "@/components/modal";
import { Badge, Button, buttonClass, EmptyState, Menu, Money, type BadgeTone, type MenuItem } from "@/components/ui";
import {
  AlertIcon, ArrowRightIcon, BankIcon, CardIcon, ChevronRight, DownloadIcon, DueIcon, InfoIcon, PeopleIcon,
  PlusIcon, TrendIcon,
} from "@/components/icons";
import { toast } from "@/components/toast";
import { saveDashboardLayout } from "@/lib/actions";
import { DEFAULT_LAYOUT, SECTIONS, type DashboardLayout, type SectionId } from "@/lib/dashboard-layout";
import type { Activity, Dashboard, Insight, OpenItem } from "@/lib/dashboard";
import { dateLong, dateShort, initials, taka, timestampLong } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { FinanceData } from "@/lib/types";
import type { Status } from "@/lib/types";

// ---- shared bits ----------------------------------------------------------------------------------------------

const KIND: Record<"asset" | "receivable" | "liability" | "projection", { label: string; tone: BadgeTone }> = {
  asset: { label: "Asset", tone: "good" },
  receivable: { label: "Receivable", tone: "owed" },
  liability: { label: "Liability", tone: "bad" },
  projection: { label: "Projection", tone: "info" },
};

function KindTag({ kind }: { kind: keyof typeof KIND }) {
  return <Badge tone={KIND[kind].tone} className="text-[11px]">{KIND[kind].label}</Badge>;
}

/** Long date in English for a YYYY-MM-DD, identical on server and client. */
function longDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
const greeting = (h: number) => (h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");

// ---- A. Hero ---------------------------------------------------------------------------------------------------

export function Hero({ d, hour, actions }: { d: Dashboard; hour: number; actions: React.ReactNode }) {
  const bank = d.bank;
  return (
    <header className="flex flex-col gap-5 border-b border-line pb-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="eyebrow">{longDate(d.today)}</div>
          <h1 className="m-0 mt-2 font-display text-title font-normal">{greeting(hour)}.</h1>
          <p className="m-0 mt-1.5 text-[14.5px] text-slate-500">Your money at a glance — cash, what you're owed, what you owe, and what's coming.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>
      </div>

      {/* The four kinds of number, side by side and never added together. */}
      <section aria-label="Financial position" className="surface-card grid overflow-hidden lg:grid-cols-[1.35fr_1fr_1fr_1fr] [&>*+*]:border-t [&>*+*]:border-line lg:[&>*+*]:border-l lg:[&>*+*]:border-t-0">
        <div className="relative flex flex-col gap-1.5 bg-[linear-gradient(135deg,var(--color-good-tint),transparent_70%)] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2"><span className="eyebrow">Cash · {bank?.name ?? "Bank"}</span><KindTag kind="asset" /></div>
          {bank ? (
            <>
              <Money value={bank.balance} className="text-display" />
              <div className="text-[12.5px] text-slate-500">As of {timestampLong(bank.updatedAt)} — the balance you last entered. Balance history isn't stored, so no change over time is shown.</div>
            </>
          ) : <div className="text-[14px] text-slate-500">No bank account set up yet.</div>}
        </div>
        <Position kind="receivable" label="Owed to you" value={d.receivables.total}
          note={`Bank loans ${taka(d.receivables.bankLoans)} · card purchases ${taka(d.receivables.cards)}. Not cash until repaid.`} />
        <Position kind="liability" label="Owed on your cards" value={d.liabilities.cards}
          note={`${d.cards.length} card balances. ${taka(d.receivables.cards)} of it is others' purchases.`} />
        <Position kind="projection" label="Bank after loans repaid" value={d.projection?.bankAfterLoans ?? null}
          note="Cash + bank-loan receivables. Card receivables are excluded — they repay the card, not the bank." />
      </section>
    </header>
  );
}

function Position({ kind, label, value, note }: { kind: keyof typeof KIND; label: string; value: number | null; note: string }) {
  const tone = kind === "receivable" ? "owed" : kind === "liability" ? "bad" : kind === "projection" ? "ink" : "ink";
  return (
    <div className="flex flex-col gap-1.5 p-5">
      <div className="flex items-center justify-between gap-2"><span className="eyebrow">{label}</span><KindTag kind={kind} /></div>
      {value == null ? <span className="text-figure text-slate-400">—</span> : <Money value={value} tone={tone} className="text-figure" />}
      <div className="text-[12.5px] text-slate-500">{note}</div>
    </div>
  );
}

/** Quick actions in the hero. Card transactions pick a card first; everything else is one tap. */
export function QuickActions({ d, onAddLoan, onCardUse, onRepay }: {
  d: Dashboard; onAddLoan: () => void; onCardUse: (cardId: string) => void; onRepay: () => void;
}) {
  const emiCard = d.cards.find((c) => c.emiOutstanding > 0) ?? d.cards[0];
  const cardItems: MenuItem[] = d.cards.map((c) => ({ label: c.label, icon: <CardIcon size={17} />, onSelect: () => onCardUse(c.card.id) }));
  return (
    <>
      <Button onClick={onAddLoan} className="flex-auto sm:flex-none"><PlusIcon size={15} />Add loan</Button>
      {d.cards.length > 0 && (
        <Menu label="Record a card transaction" align="end" items={cardItems}
          triggerClass={buttonClass("secondary", "md", "flex-auto sm:flex-none")}
          trigger={<><CardIcon size={15} />Card transaction</>} />
      )}
      <Button variant="secondary" onClick={onRepay} className="flex-auto sm:flex-none"><TrendIcon size={15} />Record repayment</Button>
      <Menu label="More actions" align="end" items={[
        ...(emiCard ? [{ kind: "link" as const, label: "Review EMI", icon: <DueIcon size={17} />, href: `/cards/${emiCard.card.slot}` }] : []),
        { kind: "link", label: "View debtors", icon: <PeopleIcon size={17} />, href: "/debtors" },
        { kind: "link", label: "Export CSV backup", icon: <DownloadIcon size={17} />, href: "/export", download: true },
      ]} trigger={<span className="text-[14px] font-medium">More</span>}
        triggerClass={buttonClass("ghost", "md", "border border-line")} />
    </>
  );
}

// ---- B. Snapshot ----------------------------------------------------------------------------------------------

export function Snapshot({ d }: { d: Dashboard }) {
  const m = d.monthToDate;
  const nextBill = d.obligations.find((o) => !o.passed) ?? d.obligations[0];
  const myShare = sumBy(d.cards, (c) => c.myShare);
  const loanPeople = new Set(d.open.filter((o) => o.source === "loan").map((o) => o.personId)).size;
  return (
    <section aria-labelledby="snap-h" className="flex flex-col gap-3">
      <h2 id="snap-h" className="sr-only">Financial snapshot</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile icon={<BankIcon size={17} />} title="Banking" href="#bank" kind="asset"
          value={d.bank ? <Money value={d.bank.balance} /> : "—"}
          rows={d.bank ? [["Debit card tally", <Money key="d" value={d.bank.debitUsed} tone="muted" />]] : []}
          note="The debit tally is a running total you add to; it doesn't change the balance." />
        <Tile icon={<CardIcon size={17} />} title="Credit cards" href="#cards" kind="liability"
          value={<Money value={d.liabilities.cards} tone="bad" />}
          rows={[["Others owe on them", <Money key="o" value={d.receivables.cards} tone="owed" />], ["Your own share", <Money key="m" value={myShare} />]]}
          note="Your share = card balance − what others owe for their purchases." />
        <Tile icon={<PeopleIcon size={17} />} title="Personal loans" href="/debtors" kind="receivable"
          value={<Money value={d.receivables.bankLoans} tone="owed" />}
          rows={[["People", <span key="p" className="money">{loanPeople}</span>], ["Projected bank", d.projection ? <Money key="b" value={d.projection.bankAfterLoans} /> : "—"]]}
          note="Bank-funded loans still outstanding." />
        <Tile icon={<TrendIcon size={17} />} title="Collections" kind="receivable"
          value={<Money value={m.current.recovered} tone="good" />}
          rows={[[`${m.previousLabel}`, <Money key="p" value={m.previous.recovered} tone="muted" />], [`Lent in ${m.label.split(" ")[0]}`, <Money key="l" value={m.current.lent} />]]}
          note={`Recovered ${m.label.split(" ")[0]} 1–${m.days}, against the same days last month.`} />
        <Tile icon={<DueIcon size={17} />} title="Obligations" href="#cards" kind="liability"
          value={nextBill ? <Money value={nextBill.amount} tone="bad" /> : <span className="text-slate-400">None</span>}
          rows={nextBill ? [["Card", <span key="c" className="truncate">{nextBill.label.replace(" Credit Card", "")}</span>], ["Pay by", <span key="d" className={nextBill.passed ? "font-medium text-bad" : ""}>{dateShort(nextBill.iso)}{nextBill.passed ? " · passed" : ""}</span>]] : []}
          note="Full card balance by its pay-by date (statement minimums aren't tracked)." />
      </div>
    </section>
  );
}

function Tile({ icon, title, kind, value, rows, note, href }: {
  icon: React.ReactNode; title: string; kind: keyof typeof KIND; value: React.ReactNode; rows: [string, React.ReactNode][]; note: string; href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold"><span className="grid size-7 place-items-center rounded-lg bg-soft text-slate-600">{icon}</span>{title}</span>
        <KindTag kind={kind} />
      </div>
      <div className="text-[22px] leading-tight">{value}</div>
      {rows.length > 0 && (
        <dl className="m-0 flex flex-col gap-1 text-[12.5px]">
          {rows.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-2"><dt className="text-slate-500">{k}</dt><dd className="m-0 truncate">{v}</dd></div>)}
        </dl>
      )}
      <p className="m-0 mt-auto border-t border-soft pt-2 text-[11.5px] leading-snug text-slate-500">{note}</p>
    </>
  );
  const cls = "spot surface-card flex min-w-0 flex-col gap-2.5 p-4";
  return href ? <Link href={href} className={`${cls} lift`}>{body}</Link> : <div className={cls}>{body}</div>;
}

// ---- C. Cash movement --------------------------------------------------------------------------------------------

type Series = "all" | "loans" | "card";
export function CashMovement({ data, today }: { data: FinanceData; today: string }) {
  const [series, setSeries] = useState<Series>("all");
  const flows = useMemo<Flow[]>(() => {
    const repaid = data.repayments.filter((r) => series === "all" || (series === "loans" ? r.applies_to === "loan" : r.applies_to === "card"));
    return [
      ...(series !== "card" ? data.loans.map((l) => ({ iso: l.taken_on, amount: l.amount, dir: "out" as const })) : []),
      ...(series !== "loans" ? data.cardUses.filter((u) => u.person_id).map((u) => ({ iso: u.used_on, amount: u.amount, dir: "out" as const })) : []),
      ...repaid.map((r) => ({ iso: r.paid_on, amount: r.amount, dir: "in" as const })),
    ];
  }, [data, series]);
  const labels: Record<Series, [string, string, string]> = {
    all: ["Lent (loans + others' card use)", "Recovered", "Money you lent from the bank or let others put on your cards, against repayments received."],
    loans: ["Bank loans", "Loan repayments", "Bank-funded loans against repayments recorded for loans."],
    card: ["Others' card use", "Card repayments", "Purchases others made on your cards against what they repaid for them. Your own card spending is not included."],
  };
  const [outL, inL, sub] = labels[series];
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Which money to show" className="flex flex-wrap gap-1.5">
        {([["all", "All lending"], ["loans", "Bank loans"], ["card", "Card purchases"]] as [Series, string][]).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={series === k} onClick={() => setSeries(k)}
            className={`min-h-9 rounded-full border px-3.5 text-[13px] font-medium ${series === k ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-slate-600 hover:border-line-strong hover:text-ink"}`}>
            {l}
          </button>
        ))}
      </div>
      <FlowChart key={series} title="Cash movement" sub={sub} flows={flows} today={today} outLabel={outL} inLabel={inL} />
    </div>
  );
}

// ---- E. Receivables ---------------------------------------------------------------------------------------------

const DUE_TONE: Record<OpenItem["status"], { label: string; cls: string }> = {
  overdue: { label: "Overdue", cls: "text-bad font-medium" },
  week: { label: "Due ≤ 7 days", cls: "text-owed font-medium" },
  later: { label: "Later", cls: "text-slate-600" },
  undated: { label: "No date", cls: "text-slate-500" },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Same person, same date, same source → one row (two card purchases due the same day read as one payment). */
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

export function Receivables({ d, onOpen }: { d: Dashboard; onOpen: (personId: string) => void }) {
  const upcoming = groupDue(d.open.filter((o) => o.status !== "undated")).slice(0, 6);
  const cardName = (id: string | null) => d.cards.find((c) => c.card.id === id)?.label.replace(" Credit Card", " card") ?? "Bank loan";
  const max = d.largest[0]?.owes ?? 0;
  return (
    <SectionCard labelledBy="recv-h">
      <SectionHead id="recv-h" title="Receivables" sub="Money other people owe you, by when it's due. Repayments clear the earliest-due item first." />
      <div className="grid grid-cols-2 gap-px border-y border-line bg-line md:grid-cols-4">
        <Stat label="Outstanding" value={d.receivables.total} tone="owed" note={plural(new Set(d.open.map((o) => o.personId)).size, "person", "people")} />
        <Stat label="Due in 7 days" value={d.dueWeek.amount} tone="owed" note={plural(d.dueWeek.count, "item")} />
        <Stat label="Overdue" value={d.overdue.amount} tone={d.overdue.amount ? "bad" : "muted"} note={plural(d.overdue.count, "item")} icon={d.overdue.amount ? <AlertIcon size={13} /> : null} />
        <Stat label="No due date" value={d.undated.amount} tone="muted" note={plural(d.undated.count, "item")} />
      </div>
      <div className="grid gap-0 lg:grid-cols-[1.2fr_1fr] [&>*+*]:border-t [&>*+*]:border-line lg:[&>*+*]:border-l lg:[&>*+*]:border-t-0">
        <div className="p-4 sm:p-5">
          <h3 className="eyebrow m-0 mb-2">Next due</h3>
          {upcoming.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {upcoming.map((o) => (
                <li key={o.key}>
                  <button type="button" onClick={() => onOpen(o.personId)} className="group flex w-full items-center gap-3 rounded-lg px-1.5 py-2 text-left hover:bg-subtle">
                    <span className={`w-[92px] flex-none text-[12.5px] ${DUE_TONE[o.status].cls}`}>{o.status === "overdue" && <DueIcon size={12} className="mr-1 inline" />}{dateShort(o.iso)}<span className="block text-[11px] font-normal text-slate-500">{DUE_TONE[o.status].label}</span></span>
                    <Avatar text={initials(o.name)} size={28} />
                    <span className="min-w-0 flex-auto">
                      <span className="block truncate text-[13.5px] font-medium group-hover:text-brand-ink">{o.name}</span>
                      <span className="block truncate text-[12px] text-slate-500">{o.source === "loan" ? "Bank loan" : cardName(o.cardId)}{o.emi ? " · EMI installment" : ""}{o.count > 1 ? ` · ${o.count} items` : ""}</span>
                    </span>
                    <Money value={o.left} tone={o.status === "overdue" ? "bad" : "owed"} className="text-[13.5px]" />
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title="Nothing scheduled">No dated repayments are outstanding.</EmptyState>}
        </div>
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <Ring value={d.collection.pct} size={84} stroke={8}>
              <span className="money text-[15px]">{Math.round(d.collection.pct)}%</span>
            </Ring>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold">Collection progress</div>
              <div className="text-[12.5px] text-slate-500">
                <Money value={d.collection.recoveredEver} tone="good" /> recovered of <Money value={d.collection.lentEver} /> ever lent (loans + others' card use).
              </div>
            </div>
          </div>
          <div>
            <h3 className="eyebrow m-0 mb-2">Largest receivables</h3>
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {d.largest.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onOpen(p.id)} className="group flex w-full flex-col gap-1 rounded-lg px-1.5 py-1.5 text-left hover:bg-subtle">
                    <span className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate font-medium group-hover:text-brand-ink">{p.name}</span>
                      <span className="flex-none"><Money value={p.owes} /> <span className="text-[11.5px] text-slate-500">· {p.share}%</span></span>
                    </span>
                    <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-soft"><span className="bar-fill block h-full rounded-full bg-owed-bar" style={{ width: `${max ? (p.owes / max) * 100 : 0}%` }} /></span>
                  </button>
                </li>
              ))}
              {!d.largest.length && <li className="text-[13px] text-slate-500">Nobody owes you anything.</li>}
            </ol>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function Stat({ label, value, tone, note, icon }: { label: string; value: number; tone: "owed" | "bad" | "muted"; note: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface px-4 py-3 sm:px-5">
      <span className="eyebrow flex items-center gap-1">{icon}{label}</span>
      <Money value={value} tone={tone} className="text-[20px]" />
      <span className="text-[11.5px] text-slate-500">{note}</span>
    </div>
  );
}

// ---- F. Credit cards -----------------------------------------------------------------------------------------------

export function CardsPreview({ d }: { d: Dashboard }) {
  if (!d.cards.length) return null;
  return (
    <section aria-labelledby="cards-h" id="cards" className="flex scroll-mt-20 flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="cards-h" className="m-0 text-heading font-semibold">Credit cards</h2>
          <p className="m-0 mt-1 text-small text-slate-500">Each card on its own: what's owed on it, how much of that others owe you, and your share.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {d.cards.map((c) => {
          const othersPct = c.balance > 0 ? Math.min(Math.max((c.othersOwe / c.balance) * 100, 0), 100) : 0;
          return (
            <Link key={c.card.id} href={`/cards/${c.card.slot}`} className="spot surface-card lift flex flex-col gap-3.5 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden="true" className={`h-7 w-10 flex-none rounded-md ${c.card.slot === 1 ? "bg-[linear-gradient(135deg,#16705A,#072E25)]" : "bg-[linear-gradient(135deg,#3A3833,#121110)]"}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{c.label}</span>
                    <span className="block text-[12px] text-slate-500">{c.card.name}{c.card.last4 ? ` · •••• ${c.card.last4}` : ""}</span>
                  </span>
                </span>
                <ArrowRightIcon size={16} className="flex-none text-slate-400" />
              </div>
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <div>
                  <div className="flex items-center gap-1.5"><span className="eyebrow">Owed on card</span><KindTag kind="liability" /></div>
                  <Money value={c.balance} tone="bad" className="text-figure" />
                </div>
                {c.limit != null && (
                  <div className="text-right text-[12.5px] text-slate-500">
                    Limit <Money value={c.limit} /> · {c.utilization}% used
                    <div>Available <Money value={c.available ?? 0} tone="good" /></div>
                  </div>
                )}
              </div>
              {/* Share split of the card balance: others' purchases vs yours. */}
              <div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-soft" role="img"
                  aria-label={`Of ${taka(c.balance)}: others owe ${taka(c.othersOwe)}, your share ${taka(c.myShare)}`}>
                  <span className="bar-fill h-full bg-owed-bar" style={{ width: `${othersPct}%` }} />
                  <span className="bar-fill h-full bg-slate-400" style={{ width: `${100 - othersPct}%` }} />
                </div>
                <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[12.5px]">
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-owed-bar" />Others owe <Money value={c.othersOwe} tone="owed" /></span>
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-slate-400" />Your share <Money value={c.myShare} /></span>
                </div>
                {c.myShare < 0 && <p className="m-0 mt-1 text-[12px] text-owed">Others owe more than the card balance — the card balance may need updating.</p>}
              </div>
              <dl className="m-0 grid grid-cols-2 gap-2 border-t border-soft pt-3 text-[12.5px]">
                <div><dt className="text-slate-500">EMI still to come</dt><dd className="m-0"><Money value={c.emiOutstanding} tone={c.emiOutstanding ? "owed" : "muted"} /></dd></div>
                <div><dt className="text-slate-500">Next EMI</dt><dd className="m-0">{c.nextEmi ? <><Money value={c.nextEmi.left} /> · {dateShort(c.nextEmi.iso)} <span className="text-slate-500">({c.nextEmi.name})</span></> : <span className="text-slate-400">None</span>}</dd></div>
                <div><dt className="text-slate-500">Pay by</dt><dd className={`m-0 ${c.payByPassed ? "font-medium text-bad" : ""}`}>{c.payBy ? `${dateLong(c.payBy)}${c.payByPassed ? " · passed" : ""}` : "Not set"}</dd></div>
                <div><dt className="text-slate-500">Updated</dt><dd className="m-0">{timestampLong(c.card.updated_at)}</dd></div>
              </dl>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ---- D. Activity -------------------------------------------------------------------------------------------------

type ActFilter = "all" | "loan" | "card" | "repayment";
const ACT_META: Record<Activity["kind"], { label: string; sign: 1 | -1 | 0; icon: React.ReactNode }> = {
  loan: { label: "Loan", sign: -1, icon: <BankIcon size={15} /> },
  card_other: { label: "Card use (others)", sign: -1, icon: <CardIcon size={15} /> },
  card_own: { label: "Your card spending", sign: 0, icon: <CardIcon size={15} /> },
  repayment: { label: "Repayment", sign: 1, icon: <TrendIcon size={15} /> },
};
const TONE_BADGE: Record<Activity["statusTone"], BadgeTone> = { good: "good", owed: "owed", bad: "bad", neutral: "neutral" };

export function ActivityFeed({ d, onOpen }: { d: Dashboard; onOpen: (personId: string) => void }) {
  const [filter, setFilter] = useState<ActFilter>("all");
  const [limit, setLimit] = useState(10);
  const rows = d.activity.filter((a) => filter === "all" || (filter === "card" ? a.kind.startsWith("card") : a.kind === filter));
  const shown = rows.slice(0, limit);
  return (
    <SectionCard labelledBy="act-h">
      <SectionHead id="act-h" title="Activity" sub="Every loan, card purchase and repayment once, newest first. Your own card spending is shown but isn't a receivable."
        action={
          <div role="group" aria-label="Filter activity" className="flex flex-wrap gap-1">
            {([["all", "All"], ["loan", "Loans"], ["card", "Card"], ["repayment", "Repayments"]] as [ActFilter, string][]).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setLimit(10); }}
                className={`min-h-8 rounded-full border px-3 text-[12.5px] font-medium ${filter === k ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-slate-600 hover:text-ink"}`}>{l}</button>
            ))}
          </div>
        } />
      {shown.length ? (
        <ol className="m-0 list-none border-t border-line p-0">
          {shown.map((a) => {
            const meta = ACT_META[a.kind];
            return (
              <li key={a.id} className="flex items-center gap-3 border-b border-soft px-4 py-3 last:border-0 sm:px-5">
                <span aria-hidden="true" className={`grid size-9 flex-none place-items-center rounded-full ${meta.sign > 0 ? "bg-good-tint text-brand-2" : meta.sign < 0 ? "bg-owed-tint text-owed" : "bg-soft text-slate-500"}`}>{meta.icon}</span>
                <div className="min-w-0 flex-auto">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-[13.5px] font-medium">{a.name}</span>
                    <span className="text-[12px] text-slate-500">{meta.label}</span>
                  </div>
                  <div className="truncate text-[12.5px] text-slate-500">{dateLong(a.iso)} · {a.source} · {a.detail}</div>
                </div>
                <div className="flex flex-none flex-col items-end gap-1">
                  <Money value={meta.sign * a.amount} signed={meta.sign !== 0} tone={meta.sign > 0 ? "good" : meta.sign < 0 ? "owed" : "ink"} className="text-[14px]" />
                  <Badge tone={TONE_BADGE[a.statusTone]} className="text-[11px]">{a.status}</Badge>
                </div>
                {a.personId && (
                  <button type="button" onClick={() => onOpen(a.personId!)} aria-label={`Open ${a.name}'s profile`}
                    className="hidden size-9 flex-none place-items-center rounded-lg text-slate-400 hover:bg-soft hover:text-ink sm:grid">
                    <ChevronRight size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      ) : <div className="p-5"><EmptyState compact title="No activity">Nothing recorded in this category yet.</EmptyState></div>}
      {rows.length > limit && (
        <div className="border-t border-line p-3 text-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 15)}>Show more ({rows.length - limit} left)</Button>
        </div>
      )}
    </SectionCard>
  );
}

// ---- G. Insights -------------------------------------------------------------------------------------------------

const INSIGHT_LOOK: Record<Insight["tone"], { icon: React.ReactNode; cls: string }> = {
  bad: { icon: <AlertIcon size={16} />, cls: "border-bad-line bg-bad-tint text-bad" },
  owed: { icon: <DueIcon size={16} />, cls: "border-owed-line bg-owed-tint text-owed" },
  good: { icon: <TrendIcon size={16} />, cls: "border-good-line bg-good-tint text-brand-2" },
  info: { icon: <InfoIcon size={16} />, cls: "border-info-line bg-info-tint text-info" },
};

export function Insights({ d }: { d: Dashboard }) {
  return (
    <section aria-labelledby="ins-h" className="flex flex-col gap-3">
      <div>
        <h2 id="ins-h" className="m-0 text-heading font-semibold">Insights</h2>
        <p className="m-0 mt-1 text-small text-slate-500">Facts computed from your records — each one shows the numbers behind it.</p>
      </div>
      {d.insights.length ? (
        <ul className="m-0 grid list-none gap-2.5 p-0 md:grid-cols-2 xl:grid-cols-3">
          {d.insights.map((i) => {
            const look = INSIGHT_LOOK[i.tone];
            const inner = (
              <>
                <span aria-hidden="true" className={`grid size-8 flex-none place-items-center rounded-lg border ${look.cls}`}>{look.icon}</span>
                <span className="min-w-0 flex-auto">
                  <span className="block text-[13.5px] font-semibold text-ink">{i.title}</span>
                  <span className="block text-[12.5px] text-slate-500">{i.detail}</span>
                </span>
                {i.href && <ChevronRight size={15} className="mt-1 flex-none text-slate-400" />}
              </>
            );
            const cls = "surface-card flex h-full items-start gap-3 p-3.5";
            return <li key={i.id}>{i.href ? <Link href={i.href} className={`${cls} lift`}>{inner}</Link> : <div className={cls}>{inner}</div>}</li>;
          })}
        </ul>
      ) : <EmptyState compact title="All clear">Nothing needs attention: no overdue or upcoming repayments and no missing details.</EmptyState>}
    </section>
  );
}

// ---- H. Record repayment: pick who paid ------------------------------------------------------------------------------

export function RepayPicker({ people, onPick, onClose }: {
  people: { id: string; name: string; owes: number; status: Status }[]; onPick: (id: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal title="Record a repayment" onClose={onClose} maxWidth={460}>
      <div className="flex flex-col gap-3 p-5">
        <p className="m-0 text-[13.5px] text-slate-500">Who paid you? Their profile opens with the repayment form, where you choose the loan or card it's for.</p>
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
                <StatusPill status={p.status} />
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

// ---- Personalisation ---------------------------------------------------------------------------------------------

/**
 * Reorder and show/hide sections. Keyboard-first: ↑/↓ buttons on every row (no drag needed), a checkbox to show or
 * hide, and Reset. Saved to your account, so the layout follows you across devices.
 */
export function CustomizeDialog({ layout, onClose, onChange }: {
  layout: DashboardLayout; onClose: () => void; onChange: (l: DashboardLayout) => void;
}) {
  const [draft, setDraft] = useState<DashboardLayout>(layout);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const label = (id: SectionId) => SECTIONS.find((s) => s.id === id)!;
  const move = (i: number, by: -1 | 1) => setDraft((d) => {
    const order = [...d.order];
    const j = i + by;
    if (j < 0 || j >= order.length) return d;
    [order[i], order[j]] = [order[j], order[i]];
    return { ...d, order };
  });
  const toggle = (id: SectionId) => setDraft((d) => ({ ...d, hidden: d.hidden.includes(id) ? d.hidden.filter((x) => x !== id) : [...d.hidden, id] }));
  const save = (l: DashboardLayout) => start(async () => {
    const r = await saveDashboardLayout(l);
    if (r.error) return setError(r.error);
    onChange(l);
    toast("Dashboard layout saved.");
    onClose();
  });

  return (
    <Modal title="Customize dashboard" onClose={onClose} maxWidth={480} side
      footer={<>
        <Button variant="ghost" onClick={() => setDraft(DEFAULT_LAYOUT)} className="mr-auto">Reset layout</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button pending={pending} pendingLabel="Saving…" onClick={() => save(draft)}>Save layout</Button>
      </>}>
      <div className="flex flex-col gap-3 p-5">
        <p className="m-0 text-[13.5px] text-slate-500">The financial position and quick actions always stay at the top. Order and visibility are saved to your account.</p>
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {draft.order.map((id, i) => {
            const s = label(id);
            const shown = !draft.hidden.includes(id);
            return (
              <li key={id} className={`flex items-center gap-2 rounded-xl border border-line p-2.5 ${shown ? "bg-surface" : "bg-subtle"}`}>
                <span className="w-5 text-center text-[12px] tabular-nums text-slate-400">{i + 1}</span>
                <label className="flex min-w-0 flex-auto cursor-pointer items-center gap-2.5">
                  <input type="checkbox" checked={shown} onChange={() => toggle(id)} className="size-[18px] flex-none accent-brand-2" />
                  <span className="min-w-0">
                    <span className={`block text-[14px] font-medium ${shown ? "" : "text-slate-500"}`}>{s.label}</span>
                    <span className="block truncate text-[12px] text-slate-500">{s.hint}</span>
                  </span>
                </label>
                <span className="flex flex-none gap-0.5">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${s.label} up`}
                    className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-soft hover:text-ink disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === draft.order.length - 1} aria-label={`Move ${s.label} down`}
                    className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-soft hover:text-ink disabled:opacity-30">↓</button>
                </span>
              </li>
            );
          })}
        </ol>
        {error && <div role="alert" className="text-[13px] font-medium text-bad">{error}</div>}
      </div>
    </Modal>
  );
}
