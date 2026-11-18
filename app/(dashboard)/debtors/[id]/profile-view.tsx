"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Shell, useViewer } from "@/components/shell";
import { Avatar, Flash, SectionCard, SectionHead, StatusPill } from "@/components/debtors/bits";
import { RepayForm, repayTargets } from "@/components/debtors/repay-form";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { CardPurchaseDialog } from "@/components/card-purchase-dialog";
import { Badge, Button, EmptyState, Money } from "@/components/ui";
import { ChevronLeft, DownloadIcon, DueIcon } from "@/components/icons";
import { buildProfiles, cardLabel } from "@/lib/ledger";
import { computeDashboard } from "@/lib/dashboard";
import { dateLong, dateShort, taka } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { FinanceData } from "@/lib/types";

/**
 * A debtor's complete record: totals, loan vs card breakdown, upcoming dues, repayment methods, and one timeline of
 * every event with the balance after it. Figures come from lib/ledger and lib/dashboard (the same tested rules as
 * every other page), so this page always agrees with the Overview and the card pages.
 */
export function DebtorProfileView({ data, personId, today }: { data: FinanceData; personId: string; today: string }) {
  const viewer = useViewer();
  const p = useMemo(() => buildProfiles(data, today).find((x) => x.id === personId)!, [data, today, personId]);
  const d = useMemo(() => computeDashboard(data, today), [data, today]);
  const [flash, setFlash] = useState("");
  const [adding, setAdding] = useState<"loan" | "card" | null>(null);
  const [filter, setFilter] = useState<"all" | "out" | "in">("all");
  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;
  const person = data.people.find((x) => x.id === personId)!;
  const dues = d.open.filter((o) => o.personId === personId);
  const reps = data.repayments.filter((r) => r.person_id === personId);
  const methods = [...new Set(reps.map((r) => r.via))].map((via) => {
    const rs = reps.filter((r) => r.via === via);
    return { via, count: rs.length, total: sumBy(rs, (r) => r.amount), toBank: rs.filter((r) => r.account_id).length, last: rs.map((r) => r.paid_on).sort().at(-1)! };
  }).sort((a, b) => b.total - a.total);
  const events = p.events.filter((e) => filter === "all" || (filter === "in" ? e.sign < 0 : e.sign > 0));
  const cardsOwed = Object.entries(p.cardOutByCard);

  return (
    <Shell subtitle="" hero={
      <header className="flex flex-col gap-4 border-b border-line pb-6">
        <Link href="/debtors" className="inline-flex w-fit items-center gap-1 rounded-md text-[13px] text-slate-500 hover:text-ink"><ChevronLeft size={15} />All debtors</Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar text={p.initials} size={56} />
            <div className="min-w-0">
              <div className="eyebrow flex items-center gap-2">Debtor <StatusPill status={p.status} /></div>
              <h1 className="m-0 mt-1 truncate font-display text-title font-normal">{p.name}</h1>
              <p className="m-0 mt-1 text-[13.5px] text-slate-500">{[person.relation, person.phone, person.notes].filter(Boolean).join(" · ") || "No contact details recorded"}</p>
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {!viewer && <Button onClick={() => setAdding("loan")}>Add loan</Button>}
            {!viewer && data.cards.length > 0 && <Button variant="secondary" onClick={() => setAdding("card")}>Card transaction</Button>}
            <a href={`/export?type=debtor&id=${personId}`} download className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line px-3.5 text-[14px] text-slate-700 hover:bg-soft"><DownloadIcon size={15} />Statement CSV</a>
          </div>
        </div>
        <section aria-label="Totals" className="surface-card grid grid-cols-2 overflow-hidden md:grid-cols-4 [&>*]:border-line [&>*+*]:border-l max-md:[&>*:nth-child(3)]:border-l-0 max-md:[&>*:nth-child(n+3)]:border-t">
          <Fig label="Borrowed" value={p.taken} note={`${p.loanCount} loans · ${p.cardCount} card uses`} />
          <Fig label="Repaid" value={p.paid} tone="good" note={`${p.payCount} payments · ${p.pct}%`} />
          <Fig label="Outstanding" value={p.owes} tone="owed" note={p.owes > 0 ? p.dueText : "All paid back"} />
          <Fig label="Next due" value={null} text={p.due ? dateLong(p.due) : "—"} note={p.due ? (p.dueKind === "late" ? "Overdue" : p.dueKind === "soon" ? "Within 7 days" : "Later") : "Nothing scheduled"} late={p.dueKind === "late" && p.owes > 0} />
        </section>
      </header>
    }>
      <Flash text={flash} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SectionCard labelledBy="src-h">
          <SectionHead id="src-h" title="Where the debt is" sub="Bank loans and each card are separate. A repayment is applied to the one you choose." />
          <ul className="m-0 flex list-none flex-col border-t border-line p-0">
            <li className="flex items-center justify-between gap-3 border-b border-soft px-4 py-3 sm:px-5">
              <span><span className="block text-[14px] font-medium">Bank loans</span><span className="text-[12.5px] text-slate-500">{taka(p.loanTotal)} lent · {taka(p.paidLoan)} repaid</span></span>
              <Money value={p.loanOut} tone={p.loanOut ? "owed" : "muted"} className="text-[16px]" />
            </li>
            {data.cards.map((c) => {
              const out = Object.fromEntries(cardsOwed)[c.id] ?? 0;
              const used = sumBy(data.cardUses.filter((u) => u.person_id === personId && u.card_id === c.id), (u) => u.amount);
              if (!used && !out) return null;
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 border-b border-soft px-4 py-3 last:border-0 sm:px-5">
                  <span><span className="block text-[14px] font-medium">{cardLabel(c)}</span><span className="text-[12.5px] text-slate-500">{taka(used)} put on the card</span></span>
                  <Money value={out} tone={out ? "owed" : "muted"} className="text-[16px]" />
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard labelledBy="due-h">
          <SectionHead id="due-h" title="Upcoming dues" sub="What's still to pay, earliest first." />
          {dues.length ? (
            <ul className="m-0 flex list-none flex-col border-t border-line p-0">
              {dues.slice(0, 8).map((o) => (
                <li key={o.key} className="flex items-center justify-between gap-3 border-b border-soft px-4 py-2.5 last:border-0 sm:px-5">
                  <span className="text-[13.5px]">
                    <span className={`font-medium ${o.status === "overdue" ? "text-bad" : ""}`}>{o.status === "overdue" && <DueIcon size={13} className="mr-1 inline" />}{o.iso ? dateLong(o.iso) : "No due date"}</span>
                    <span className="block text-[12.5px] text-slate-500">{o.source === "loan" ? "Bank loan" : cardLabel(data.cards.find((c) => c.id === o.cardId))}{o.emi ? " · EMI installment" : ""}{o.status === "overdue" ? " · overdue" : ""}</span>
                  </span>
                  <Money value={o.left} tone={o.status === "overdue" ? "bad" : "owed"} />
                </li>
              ))}
            </ul>
          ) : <div className="border-t border-line p-4"><EmptyState compact title="Nothing due">{p.owes > 0 ? "What they owe has no due dates set." : "All paid back."}</EmptyState></div>}
        </SectionCard>
      </div>

      {!viewer && p.owes > 0 && (
        <RepayForm personId={personId} first={p.first} targets={repayTargets(p, data.cards)} mode="all" account={account} withDate
          onSaved={(t) => setFlash(t)} />
      )}

      <SectionCard labelledBy="via-h">
        <SectionHead id="via-h" title="How they repay" sub="Every repayment method used, and how many went into the bank." />
        {methods.length ? (
          <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {methods.map((m) => (
              <div key={m.via} className="flex flex-col gap-0.5 bg-surface px-4 py-3">
                <span className="text-[13.5px] font-medium">{m.via}</span>
                <Money value={m.total} tone="good" className="text-[18px]" />
                <span className="text-[12px] text-slate-500">{m.count} payment{m.count === 1 ? "" : "s"} · {m.toBank} into the bank · last {dateShort(m.last)}</span>
              </div>
            ))}
          </div>
        ) : <div className="border-t border-line p-4"><EmptyState compact title="No repayments yet" /></div>}
      </SectionCard>

      <SectionCard labelledBy="tl-h">
        <SectionHead id="tl-h" title="Timeline" sub="Every loan, card use and repayment in date order, with what they owed after it."
          action={
            <div role="group" aria-label="Show" className="flex gap-1">
              {([["all", "All"], ["out", "Borrowing"], ["in", "Repayments"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
                  className={`min-h-8 rounded-full border px-3 text-[12.5px] font-medium ${filter === k ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-slate-600 hover:text-ink"}`}>{l}</button>
              ))}
            </div>
          } />
        <ol className="m-0 list-none border-t border-line p-0">
          {events.map((e) => (
            <li key={e.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-soft px-4 py-3 last:border-0 sm:px-5">
              <span aria-hidden="true" className={`size-2.5 rounded-full ${e.sign < 0 ? "bg-brand-2" : "bg-owed-bar"}`} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">{e.kind}{e.paidFor && <Badge className="text-[10.5px]">{e.paidFor === "card" ? "card" : "loan"}</Badge>}</span>
                <span className="block truncate text-[12.5px] text-slate-500">{dateLong(e.iso)} · {e.detail}</span>
              </span>
              <span className="text-right">
                <Money value={e.sign < 0 ? e.amount : -e.amount} signed tone={e.sign < 0 ? "good" : "owed"} className="text-[14px]" />
                <span className="block text-[12px] text-slate-500">owes after <span className="money text-ink">{taka(e.owesAfter)}</span></span>
              </span>
            </li>
          ))}
          {!events.length && <li className="p-5 text-[13.5px] text-slate-500">Nothing recorded.</li>}
        </ol>
      </SectionCard>

      {adding === "loan" && (
        <AddDebtorDialog mode="loan" title={`Add loan — ${p.name}`} account={account} knownNames={data.people.map((x) => x.name)}
          lockedPerson={{ name: p.name, initials: p.initials, owes: p.owes }}
          onClose={() => setAdding(null)} onAdded={(_, t) => { setAdding(null); setFlash(t); }} />
      )}
      {adding === "card" && (
        <CardPurchaseDialog cards={data.cards} knownNames={data.people.map((x) => x.name)}
          onClose={() => setAdding(null)} onSaved={(t) => { setAdding(null); setFlash(t); }} />
      )}
    </Shell>
  );
}

function Fig({ label, value, text, note, tone = "ink", late }: { label: string; value: number | null; text?: string; note: string; tone?: "ink" | "good" | "owed"; late?: boolean }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-4 sm:px-5">
      <span className="eyebrow">{label}</span>
      {value != null ? <Money value={value} tone={tone} className="text-figure" /> : <span className={`text-[20px] font-medium ${late ? "text-bad" : ""}`}>{text}</span>}
      <span className={`text-[12px] ${late ? "font-medium text-bad" : "text-slate-500"}`}>{note}</span>
    </div>
  );
}
