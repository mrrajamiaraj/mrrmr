"use client";

import { useMemo, useState } from "react";
import { SectionCard, SectionHead } from "@/components/debtors/bits";
import { Badge, Button, EmptyState, Money } from "@/components/ui";
import { InIcon, InfoIcon, OutIcon, SearchIcon } from "@/components/icons";
import { FlowBars } from "@/components/viz";
import { stagger } from "@/components/motion";
import { sumBy } from "@/lib/money";
import { bankMovements } from "@/lib/bank";
import { dateLong, monthLabel } from "@/lib/format";
import type { FinanceData } from "@/lib/types";

type Kind = "all" | "credit" | "loan";

/**
 * Recorded movements on the bank account — partial by design: see lib/bank.ts for what the data can and can't show.
 * Search, type filter and a date range; a monthly breakdown that keeps money in and loans made separate.
 */
export function BankMovements({ data, accountId, accountName, onOpen }: { data: FinanceData; accountId: string; accountName: string; onOpen: (personId: string) => void }) {
  const { rows, months } = useMemo(() => bankMovements(data, accountId), [data, accountId]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(12);
  const shown = rows.filter((r) =>
    (kind === "all" || r.kind === kind) && (!from || r.iso >= from) && (!to || r.iso <= to) &&
    (!q.trim() || `${r.name} ${r.detail} ${r.amount}`.toLowerCase().includes(q.trim().toLowerCase())));
  const filtered = q || kind !== "all" || from || to;
  const totalIn = sumBy(rows.filter((r) => r.kind === "credit"), (r) => r.amount);
  const totalOut = sumBy(rows.filter((r) => r.kind === "loan"), (r) => r.amount);
  const maxAmt = Math.max(1, ...shown.slice(0, limit).map((r) => r.amount));
  const sel = "min-h-10 rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px]";

  return (
    <SectionCard labelledBy="mov-h">
      <SectionHead id="mov-h" title="Recorded bank movements" sub={`Money in and loans out of ${accountName} that the app recorded.`} />
      <div className="mx-4 mb-3 flex gap-2.5 rounded-lg border border-info-line bg-info-tint p-3 text-[12.5px] text-slate-700 sm:mx-5">
        <InfoIcon size={16} className="mt-0.5 flex-none text-info" />
        <span>
          <b>Partial by design.</b> Repayments marked “credited” were added to the balance when recorded. For loans, whether the amount was taken out of the
          balance wasn't recorded. Manual balance edits and individual debit-card entries aren't stored, so they can't appear — and the balance can't be
          reconciled from this list.
        </span>
      </div>

      {months.length > 0 && (
        <div className="grid gap-4 border-t border-line px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <FlowBars height={130} aLabel="Loans made" bLabel="Credited in"
            months={months.slice(0, 8).reverse().map((m) => ({ key: m.ym, label: monthLabel(m.ym), short: monthLabel(m.ym).split(" ")[0], a: m.loansMade, b: m.credited }))} />
          <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border border-good-line bg-good-tint p-3.5">
              <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-ink"><InIcon size={15} />Credited in · all time</span>
              <Money value={totalIn} tone="good" className="mt-1 block text-[22px]" />
              <span className="text-[12px] text-slate-500">{rows.filter((r) => r.kind === "credit").length} repayments added to the balance</span>
            </div>
            <div className="rounded-xl border border-owed-line bg-owed-tint p-3.5">
              <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-owed"><OutIcon size={15} />Loans made · all time</span>
              <Money value={totalOut} tone="owed" className="mt-1 block text-[22px]" />
              <span className="text-[12px] text-slate-500">Whether each was taken from the balance isn&apos;t recorded</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-line px-4 py-3 sm:px-5">
        <label className="flex min-h-10 min-w-[180px] flex-[2_1_220px] items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:border-brand-2 focus-within:shadow-[var(--shadow-focus)]">
          <SearchIcon size={15} className="text-slate-500" /><span className="sr-only">Search movements</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, reason, amount" className="min-w-0 flex-auto bg-transparent text-[14px] outline-none" />
        </label>
        <label className="sr-only" htmlFor="mv-kind">Type</label>
        <select id="mv-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={sel}>
          <option value="all">All movements</option><option value="credit">Credited repayments</option><option value="loan">Loans made</option>
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-500">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} /></label>
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-500">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} /></label>
        {filtered && <Button variant="quiet" size="sm" onClick={() => { setQ(""); setKind("all"); setFrom(""); setTo(""); }}>Clear</Button>}
      </div>

      {shown.length ? (
        <ol className="relative m-0 list-none border-t border-line px-4 py-2 sm:px-5">
          <span aria-hidden="true" className="absolute bottom-4 left-[38px] top-4 w-px bg-gradient-to-b from-line-strong via-line to-transparent sm:left-[42px]" />
          {shown.slice(0, limit).map((r, k) => {
            const credit = r.kind === "credit";
            return (
              <li key={r.id} style={stagger(k, 35, 420)} className="relative flex animate-fade-up items-center gap-3 py-2">
                <span aria-hidden="true" className={`relative z-10 grid size-9 flex-none place-items-center rounded-full ring-4 ring-surface ${credit ? "bg-good-tint text-brand-2" : "bg-owed-tint text-owed"}`}>
                  {credit ? <InIcon size={16} /> : <OutIcon size={16} />}
                </span>
                <div className="min-w-0 flex-auto">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <button type="button" onClick={() => onOpen(r.personId)} className="min-h-6 text-left text-[14px] font-medium hover:text-brand-ink hover:underline">{r.name}</button>
                    <span className="text-[12px] text-slate-500">{dateLong(r.iso)}</span>
                  </div>
                  <div className="truncate text-[12.5px] text-slate-500">{r.detail}</div>
                  <span aria-hidden="true" className="mt-1 block h-1 max-w-[340px] overflow-hidden rounded-full bg-soft">
                    <span className={`bar-fill block h-full rounded-full ${credit ? "bg-chart-in" : "bg-owed-bar"}`} style={{ width: `${Math.max((r.amount / maxAmt) * 100, 3)}%`, animationDelay: `${Math.min(k * 35, 420) + 120}ms` }} />
                  </span>
                </div>
                <div className="flex flex-none flex-col items-end gap-1">
                  {credit ? <Money value={r.amount} tone="good" signed className="text-[15px]" /> : <Money value={-r.amount} tone="owed" signed className="text-[15px]" />}
                  {r.effect === "credited" ? <Badge tone="good" className="text-[11px]">Into the bank</Badge> : <Badge tone="neutral" className="text-[11px]">Loan · deduction not recorded</Badge>}
                </div>
              </li>
            );
          })}
        </ol>
      ) : <div className="border-t border-line p-5"><EmptyState compact title={filtered ? "No matches" : "No recorded movements"}>{filtered ? "Nothing matches these filters." : "Repayments credited to the account and loans made from it will appear here."}</EmptyState></div>}
      {shown.length > limit && <div className="border-t border-line p-3 text-center"><Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 20)}>Show more ({shown.length - limit} left)</Button></div>}
    </SectionCard>
  );
}
