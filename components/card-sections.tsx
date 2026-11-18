"use client";

// Card page sections. Display only: figures come from lib/dashboard (per-card summary and open items) and
// lib/ledger (plans). The card balance is a LIABILITY — what you owe the issuer — never a deposit.

import { useMemo, useState } from "react";
import { SectionCard, SectionHead } from "@/components/debtors/bits";
import { OneSchedule } from "@/components/debtors/emi-schedule";
import { Modal } from "@/components/modal";
import { Badge, Button, EmptyState, Money } from "@/components/ui";
import { DueIcon, SearchIcon, TrashIcon } from "@/components/icons";
import type { CardSummary, OpenItem } from "@/lib/dashboard";
import { owedOf, type PlanStatus } from "@/lib/ledger";
import { dateLong, dateShort, taka, timestampLong } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { CardUse } from "@/lib/types";

// ---- Breakdown + upcoming dates ---------------------------------------------------------------------------------

export function CardBreakdown({ c, open, today }: { c: CardSummary; open: OpenItem[]; today: string }) {
  const upcoming = open.filter((o) => o.cardId === c.card.id && o.iso).slice(0, 6);
  const parts = [
    { label: "Others owe you", value: c.othersOwe, cls: "bg-owed-bar", tone: "owed" as const, note: "Their purchases on this card, still unpaid (incl. any EMI charges)." },
    { label: "Your own liability", value: c.myShare, cls: "bg-slate-500", tone: "ink" as const, note: "Card balance − what others owe: the part you pay yourself." },
  ];
  const pctOthers = c.balance > 0 ? Math.min(Math.max((c.othersOwe / c.balance) * 100, 0), 100) : 0;
  return (
    <SectionCard labelledBy="bd-h">
      <SectionHead id="bd-h" title="Breakdown" sub="What you owe on this card, and whose spending it is. The card balance is money you owe the bank — not money you have." />
      <div className="grid gap-0 border-t border-line lg:grid-cols-[1.3fr_1fr] [&>*+*]:border-t [&>*+*]:border-line lg:[&>*+*]:border-l lg:[&>*+*]:border-t-0">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div>
            <div className="flex items-center gap-1.5"><span className="eyebrow">Outstanding balance</span><Badge tone="bad" className="text-[10.5px]">Liability</Badge></div>
            <Money value={c.balance} tone="bad" className="text-figure" />
            <div className="text-[12px] text-slate-500">As entered · updated {timestampLong(c.card.updated_at)}</div>
          </div>
          <div>
            <div className="flex h-3 overflow-hidden rounded-full bg-soft" role="img" aria-label={`Of ${taka(c.balance)}: others owe ${taka(c.othersOwe)}, your own ${taka(c.myShare)}`}>
              <span className="bar-fill h-full bg-owed-bar" style={{ width: `${pctOthers}%` }} />
              <span className="bar-fill h-full bg-slate-500" style={{ width: `${100 - pctOthers}%` }} />
            </div>
            <dl className="m-0 mt-3 grid gap-3 sm:grid-cols-2">
              {parts.map((p) => (
                <div key={p.label}>
                  <dt className="flex items-center gap-1.5 text-[12.5px] text-slate-500"><span aria-hidden="true" className={`size-2 rounded-full ${p.cls}`} />{p.label}</dt>
                  <dd className="m-0"><Money value={p.value} tone={p.tone} className="text-[18px]" /><span className="block text-[11.5px] text-slate-500">{p.note}</span></dd>
                </div>
              ))}
            </dl>
            {c.myShare < 0 && <p className="m-0 mt-2 text-[12px] font-medium text-owed">Others owe more than the card balance — the balance may be out of date (e.g. EMI charges not yet billed).</p>}
          </div>
          {c.limit != null ? (
            <div className="rounded-lg border border-line bg-subtle p-3 text-[12.5px]">
              <div className="flex justify-between"><span className="text-slate-500">Utilisation</span><span className={`money ${c.utilization! >= 80 ? "text-bad" : ""}`}>{c.utilization}%</span></div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"><span className={`block h-full rounded-full ${c.utilization! >= 80 ? "bg-bad" : "bg-brand-2"}`} style={{ width: `${Math.min(c.utilization!, 100)}%` }} /></div>
              <div className="mt-1.5 flex justify-between text-slate-500"><span>Limit <Money value={c.limit} /></span><span>Available <Money value={c.available ?? 0} tone="good" /></span></div>
            </div>
          ) : <p className="m-0 text-[12.5px] text-slate-500">No credit limit recorded, so utilisation isn't shown.</p>}
        </div>
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <h3 className="eyebrow m-0">Upcoming dates</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {c.payBy && (
              <li className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-2.5 py-2">
                <span><span className={`font-medium ${c.payByPassed ? "text-bad" : ""}`}>{dateLong(c.payBy)}</span><span className="block text-[12px] text-slate-500">Your card bill{c.payByPassed ? " — date passed, update it" : ""}</span></span>
                <Money value={c.balance} tone="bad" />
              </li>
            )}
            {upcoming.map((o) => (
              <li key={o.key} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                <span><span className={`font-medium ${o.status === "overdue" ? "text-bad" : ""}`}>{o.status === "overdue" && <DueIcon size={12} className="mr-1 inline" />}{dateShort(o.iso)}</span>
                  <span className="block text-[12px] text-slate-500">{o.name} {o.emi ? "· EMI installment" : "· full payment"}{o.iso! < today ? " · overdue" : ""}</span></span>
                <Money value={o.left} tone="owed" />
              </li>
            ))}
            {!c.payBy && !upcoming.length && <li className="text-slate-500">Nothing scheduled.</li>}
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}

// ---- EMI plans on this card ---------------------------------------------------------------------------------------

export function CardEmiPlans({ plans, names, today }: { plans: PlanStatus[]; names: Map<string, string>; today: string }) {
  const emis = plans.filter((p) => p.plan === "emi").sort((a, b) => b.left - a.left || a.usedOn.localeCompare(b.usedOn));
  const remaining = sumBy(emis, (p) => p.left);
  return (
    <SectionCard labelledBy="emi-h">
      <SectionHead id="emi-h" title="EMI plans" sub={emis.length ? `${emis.length} plan${emis.length === 1 ? "" : "s"} · ${taka(remaining)} still to come. Repayments clear the earliest installment first.` : "Purchases paid back in monthly installments appear here."} />
      <div className="flex flex-col gap-3 border-t border-line p-4 sm:p-5">
        {emis.length ? emis.map((p) => <OneSchedule key={p.useId} plan={p} today={today} who={names.get(p.personId)} />)
          : <EmptyState compact title="No EMI plans">Choose “EMI” when you record a card transaction to spread it over 3–36 months.</EmptyState>}
      </div>
    </SectionCard>
  );
}

// ---- Transaction filters + detail drawer ----------------------------------------------------------------------------

export type TxnFilter = { q: string; who: string; plan: "all" | "full" | "emi" | "mine"; from: string; to: string };
export const NO_FILTER: TxnFilter = { q: "", who: "", plan: "all", from: "", to: "" };

export function useTxnFilter(uses: CardUse[], nameOf: (id: string | null) => string) {
  const [f, setF] = useState<TxnFilter>(NO_FILTER);
  const rows = useMemo(() => uses.filter((u) => {
    const q = f.q.trim().toLowerCase();
    if (q && !`${nameOf(u.person_id)} ${u.reason_or_place} ${u.category} ${u.amount}`.toLowerCase().includes(q)) return false;
    if (f.who && (u.person_id ?? "me") !== f.who) return false;
    if (f.plan === "mine" && u.person_id) return false;
    if ((f.plan === "full" || f.plan === "emi") && (!u.person_id || (u.pay_plan ?? "full") !== f.plan)) return false;
    if (f.from && u.used_on < f.from) return false;
    if (f.to && u.used_on > f.to) return false;
    return true;
  }), [uses, f, nameOf]);
  return { f, setF, rows, active: JSON.stringify(f) !== JSON.stringify(NO_FILTER) };
}

export function TxnFilters({ f, setF, people, shown, total }: {
  f: TxnFilter; setF: (f: TxnFilter) => void; people: { id: string; name: string }[]; shown: number; total: number;
}) {
  const sel = "min-h-10 rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px]";
  return (
    <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-h-10 min-w-[200px] flex-[2_1_240px] items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:border-brand-2 focus-within:shadow-[var(--shadow-focus)]">
          <SearchIcon size={15} className="text-slate-500" /><span className="sr-only">Search transactions</span>
          <input type="search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search person, place, category, amount" className="min-w-0 flex-auto bg-transparent text-[14px] outline-none" />
        </label>
        <label className="sr-only" htmlFor="tx-who">Person</label>
        <select id="tx-who" value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} className={sel}>
          <option value="">Everyone</option><option value="me">Me</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="tx-plan">Plan</label>
        <select id="tx-plan" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value as TxnFilter["plan"] })} className={sel}>
          <option value="all">All plans</option><option value="full">Full payment</option><option value="emi">EMI</option><option value="mine">My spending</option>
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-500">From<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={sel} /></label>
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-500">To<input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={sel} /></label>
      </div>
      <div role="status" className="flex items-center justify-between text-[12.5px] text-slate-500">
        <span>Showing {shown} of {total}</span>
        {JSON.stringify(f) !== JSON.stringify(NO_FILTER) && <Button variant="quiet" size="sm" onClick={() => setF(NO_FILTER)}>Clear filters</Button>}
      </div>
    </div>
  );
}

/** Everything about one card transaction, including the other shares of a split purchase. Delete is the only action. */
export function TxnDrawer({ u, all, plan, nameOf, onDelete, onClose, viewer }: {
  u: CardUse; all: CardUse[]; plan?: PlanStatus; nameOf: (id: string | null) => string;
  onDelete: () => void; onClose: () => void; viewer: boolean;
}) {
  const siblings = u.purchase_group ? all.filter((x) => x.purchase_group === u.purchase_group && x.id !== u.id) : [];
  const rows: [string, React.ReactNode][] = [
    ["Date", dateLong(u.used_on)],
    ["Paid by", u.person_id ? nameOf(u.person_id) : "Me (your own spending)"],
    ["Why / where", u.reason_or_place],
    ["Category", u.category],
    ["Amount on card", <Money key="a" value={u.amount} />],
    ...(u.emi_charges ? [["EMI charges (owed by them)", <Money key="c" value={u.emi_charges} />] as [string, React.ReactNode]] : []),
    ...(u.person_id ? [["They owe for this", <Money key="o" value={owedOf(u)} tone="owed" />] as [string, React.ReactNode]] : []),
    ["Plan", !u.person_id ? "—" : u.pay_plan === "emi" ? `EMI · ${u.emi_months} months from ${dateLong(u.due_on)}` : u.due_on ? `Full payment by ${dateLong(u.due_on)}` : "Full payment · no date set"],
    ...(plan && plan.of ? [["Still to pay", plan.left > 0 ? <Money key="l" value={plan.left} tone="owed" /> : <span key="l" className="text-brand-2">Paid</span>] as [string, React.ReactNode]] : []),
    ["Recorded", timestampLong(u.created_at)],
  ];
  return (
    <Modal title="Transaction details" onClose={onClose} maxWidth={460} side
      footer={!viewer ? <>
        <Button variant="ghost" onClick={onClose} className="mr-auto">Close</Button>
        <Button variant="danger" onClick={onDelete}><TrashIcon size={15} />Delete…</Button>
      </> : undefined}>
      <div className="flex flex-col gap-4 p-5">
        <div><Money value={u.amount} className="text-display" /><div className="text-[13px] text-slate-500">{u.reason_or_place}</div></div>
        <dl className="m-0 flex flex-col divide-y divide-soft rounded-xl border border-line text-[13.5px]">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-3.5 py-2.5"><dt className="text-slate-500">{k}</dt><dd className="m-0 text-right">{v}</dd></div>)}
        </dl>
        {siblings.length > 0 && (
          <div>
            <h3 className="eyebrow m-0 mb-1.5">Other shares of this split purchase</h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13.5px]">
              {siblings.map((s) => <li key={s.id} className="flex justify-between rounded-lg bg-subtle px-3 py-2"><span>{s.person_id ? nameOf(s.person_id) : "Me"}</span><Money value={s.amount} /></li>)}
            </ul>
          </div>
        )}
        <p className="m-0 text-[12px] text-slate-500">To change a transaction, delete it and record it again — deleting asks whether to undo its effect on the card balance.</p>
      </div>
    </Modal>
  );
}
