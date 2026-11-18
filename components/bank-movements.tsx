"use client";

import { useMemo, useState } from "react";
import { SectionCard, SectionHead } from "@/components/debtors/bits";
import { Badge, Button, EmptyState, Money } from "@/components/ui";
import { InfoIcon, SearchIcon } from "@/components/icons";
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
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[420px] border-collapse text-[13.5px]">
            <caption className="sr-only">Monthly breakdown</caption>
            <thead><tr className="bg-subtle text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              <th scope="col" className="px-4 py-2 sm:px-5">Month</th>
              <th scope="col" className="px-4 py-2 text-right">Credited in</th>
              <th scope="col" className="px-4 py-2 text-right sm:pr-5">Loans made <span className="normal-case tracking-normal">(effect not recorded)</span></th>
            </tr></thead>
            <tbody>
              {months.slice(0, 6).map((m) => (
                <tr key={m.ym} className="border-t border-soft">
                  <th scope="row" className="px-4 py-2 text-left font-normal text-slate-600 sm:px-5">{monthLabel(m.ym)}</th>
                  <td className="px-4 py-2 text-right">{m.credited ? <Money value={m.credited} tone="good" signed /> : "—"}</td>
                  <td className="px-4 py-2 text-right sm:pr-5">{m.loansMade ? <Money value={m.loansMade} tone="owed" /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <ol className="m-0 list-none border-t border-line p-0">
          {shown.slice(0, limit).map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-b border-soft px-4 py-2.5 last:border-0 sm:px-5">
              <div className="min-w-0 flex-auto">
                <button type="button" onClick={() => onOpen(r.personId)} className="text-left text-[13.5px] font-medium hover:text-brand-ink hover:underline">{r.name}</button>
                <div className="truncate text-[12.5px] text-slate-500">{dateLong(r.iso)} · {r.detail}</div>
              </div>
              <div className="flex flex-none flex-col items-end gap-1">
                {r.kind === "credit" ? <Money value={r.amount} tone="good" signed /> : <Money value={r.amount} tone="owed" />}
                {r.effect === "credited" ? <Badge tone="good" className="text-[11px]">Credited</Badge> : <Badge tone="neutral" className="text-[11px]">Loan · deduction not recorded</Badge>}
              </div>
            </li>
          ))}
        </ol>
      ) : <div className="border-t border-line p-5"><EmptyState compact title={filtered ? "No matches" : "No recorded movements"}>{filtered ? "Nothing matches these filters." : "Repayments credited to the account and loans made from it will appear here."}</EmptyState></div>}
      {shown.length > limit && <div className="border-t border-line p-3 text-center"><Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 20)}>Show more ({shown.length - limit} left)</Button></div>}
    </SectionCard>
  );
}
