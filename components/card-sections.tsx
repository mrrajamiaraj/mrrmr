"use client";

// Card page sections. Display only: figures come from lib/dashboard (per-card summary and open items) and
// lib/ledger (plans). The card balance is a LIABILITY — what you owe the issuer — never a deposit.

import { useMemo, useState } from "react";
import { SectionCard, SectionHead } from "@/components/debtors/bits";
import { OneSchedule } from "@/components/debtors/emi-schedule";
import { Modal } from "@/components/modal";
import { Button, EmptyState, Money } from "@/components/ui";
import { ChevronDown, SearchIcon, TrashIcon } from "@/components/icons";
import { owedOf, type PlanStatus } from "@/lib/ledger";
import { dateLong, dateShort, taka, takaExact, timestampLong } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { CardUse } from "@/lib/types";

// ---- EMI plans on this card ---------------------------------------------------------------------------------------

/**
 * One row per EMI plan — who, what, progress through its installments, what's left and the next date — expanding to
 * the full schedule. Active plans first.
 */
export function CardEmiPlans({ plans, names, today }: { plans: PlanStatus[]; names: Map<string, string>; today: string }) {
  const emis = plans.filter((p) => p.plan === "emi").sort((a, b) => Number(b.left > 0) - Number(a.left > 0) || (a.next?.iso ?? "").localeCompare(b.next?.iso ?? "") || a.usedOn.localeCompare(b.usedOn));
  const remaining = sumBy(emis, (p) => p.left);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <SectionCard labelledBy="emi-h">
      <SectionHead id="emi-h" title="EMI plans" sub={emis.length ? `${emis.length} plan${emis.length === 1 ? "" : "s"} · ${taka(remaining)} still to come. Repayments clear the earliest installment first.` : "Purchases paid back in monthly installments appear here."} />
      {emis.length ? (
        <ul className="m-0 list-none border-t border-line p-0">
          {emis.map((p) => {
            const isOpen = open === p.useId;
            const late = !!p.next && p.next.iso < today;
            return (
              <li key={p.useId} className="border-b border-soft last:border-0">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.useId)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-subtle sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto] sm:px-5">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{names.get(p.personId) ?? "Unknown"} · {p.reason}</span>
                    <span className="block text-[12.5px] text-slate-500">{p.of} × {takaExact(p.perMonth)} · bought {dateShort(p.usedOn)}</span>
                  </span>
                  <span className="order-last col-span-2 flex items-center gap-2 sm:order-none sm:col-span-1">
                    {/* One segment per installment: filled = paid; the word count beside it says the same. */}
                    <span aria-hidden="true" className="flex h-2 flex-auto gap-[2px]">
                      {p.installments.map((s) => <span key={s.n} className={`h-full flex-1 rounded-sm ${s.left <= 0 ? "bg-brand-2" : s.iso < today ? "bg-bad" : "bg-line"}`} />)}
                    </span>
                    <span className="flex-none text-[12px] text-slate-600">{p.paidCount}/{p.of} paid</span>
                  </span>
                  <span className="text-right">
                    <Money value={p.left} tone={p.left ? (late ? "bad" : "owed") : "good"} className="text-[14.5px]" />
                    <span className={`block text-[12px] ${late ? "font-medium text-bad" : "text-slate-500"}`}>{p.next ? `${late ? "Late · " : "Next "}${dateShort(p.next.iso)}` : "Paid off"}</span>
                  </span>
                  <ChevronDown size={16} className={`hidden flex-none text-slate-400 transition-transform sm:block ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && <div className="bg-subtle p-3 sm:p-4"><OneSchedule plan={p} today={today} who={names.get(p.personId)} /></div>}
              </li>
            );
          })}
        </ul>
      ) : <div className="border-t border-line p-4"><EmptyState compact title="No EMI plans">Choose “EMI” when you add a card purchase to spread it over 3–36 months.</EmptyState></div>}
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
      {/* Phones: search full width, then Person | Plan, then From | To — every control the same width. */}
      <div className="flex flex-wrap items-end gap-2 max-sm:grid max-sm:grid-cols-2 max-sm:[&>select]:w-full max-sm:[&>select]:min-w-0">
        <label className="flex min-h-10 min-w-[200px] flex-[2_1_240px] items-center gap-2 rounded-lg max-sm:col-span-2 max-sm:min-w-0 border border-line-strong bg-surface px-3 focus-within:border-brand-2 focus-within:shadow-[var(--shadow-focus)]">
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
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-500 max-sm:min-w-0 max-sm:flex-col max-sm:items-stretch max-sm:gap-1 max-sm:text-[11.5px] max-sm:font-medium">From<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={`${sel} max-sm:w-full max-sm:min-w-0 max-sm:text-ink`} /></label>
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-500 max-sm:min-w-0 max-sm:flex-col max-sm:items-stretch max-sm:gap-1 max-sm:text-[11.5px] max-sm:font-medium">To<input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={`${sel} max-sm:w-full max-sm:min-w-0 max-sm:text-ink`} /></label>
      </div>
      <div role="status" className="flex items-center justify-between text-[12.5px] text-slate-500">
        <span>Showing {shown} of {total}</span>
        {JSON.stringify(f) !== JSON.stringify(NO_FILTER) && <Button variant="quiet" size="sm" onClick={() => setF(NO_FILTER)}>Clear filters</Button>}
      </div>
    </div>
  );
}

/**
 * Everything about one card purchase: its breakdown, the other shares of a split purchase, and its EMI schedule.
 * Delete is the only action (edits are delete + re-add, by design).
 */
export function TxnDrawer({ u, all, plan, nameOf, onDelete, onClose, viewer, today }: {
  u: CardUse; all: CardUse[]; plan?: PlanStatus; nameOf: (id: string | null) => string;
  onDelete: () => void; onClose: () => void; viewer: boolean; today: string;
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
    <Modal title="Purchase details" onClose={onClose} maxWidth={plan?.plan === "emi" ? 640 : 460} side
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
        {plan && plan.plan === "emi" && (
          <div>
            <h3 className="eyebrow m-0 mb-1.5">EMI schedule</h3>
            <OneSchedule plan={plan} today={today} />
          </div>
        )}
        <p className="m-0 text-[12px] text-slate-500">To change a purchase, delete it and add it again. Deleting shows exactly what changes and asks before touching the card balance.</p>
      </div>
    </Modal>
  );
}
