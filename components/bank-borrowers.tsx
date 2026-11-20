"use client";

// "Who took money from City Bank": every person with a loan recorded against the bank account, with each loan's
// details. Figures come from lib/bank (bankBorrowers, tested) and lib/ledger profiles (what's still owed on loans).
// Display only; each name opens that person's profile.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar, SectionCard, SectionHead } from "@/components/debtors/bits";
import { Badge, EmptyState, Money } from "@/components/ui";
import { ChevronDown, SearchIcon } from "@/components/icons";
import { CountUp, stagger } from "@/components/motion";
import { DateChip, HUES, SplitBar } from "@/components/viz";
import { bankBorrowers } from "@/lib/bank";
import type { Profile } from "@/lib/ledger";
import { dateLong, initials, taka } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { FinanceData } from "@/lib/types";

type Sort = "taken" | "owes" | "recent" | "name";

export function BankBorrowers({ data, accountId, accountName, profiles, today }: {
  data: FinanceData; accountId: string; accountName: string; profiles: Profile[]; today: string;
}) {
  const rows = useMemo(() => {
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return bankBorrowers(data, accountId).map((b) => ({ ...b, p: byId.get(b.personId) }));
  }, [data, accountId, profiles]);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("taken");
  const [owingOnly, setOwingOnly] = useState(false);

  const taken = sumBy(rows, (r) => r.taken);
  const back = sumBy(rows, (r) => r.creditedBack);
  const stillOwed = sumBy(rows, (r) => r.p?.loanOut ?? 0);
  const owing = rows.filter((r) => (r.p?.loanOut ?? 0) > 0).length;
  const ql = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => (!owingOnly || (r.p?.loanOut ?? 0) > 0) && (!ql || `${r.name} ${r.relation ?? ""} ${r.phone ?? ""} ${r.loans.map((l) => l.reason).join(" ")}`.toLowerCase().includes(ql)))
    .sort((a, b) => sort === "owes" ? (b.p?.loanOut ?? 0) - (a.p?.loanOut ?? 0) : sort === "recent" ? b.last.localeCompare(a.last) : sort === "name" ? a.name.localeCompare(b.name) : b.taken - a.taken);
  const maxTaken = Math.max(1, ...rows.map((r) => r.taken));
  const top = rows.slice(0, 8);

  return (
    <SectionCard labelledBy="borrowers-h">
      <SectionHead id="borrowers-h" title={`Who took money from ${accountName}`}
        sub="Everyone with a loan recorded from this account — tap a person for every loan, or their name for the full profile." />

      {rows.length ? (
        <>
          <div className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-4">
            {([["People", rows.length, null, `${owing} still owe on loans`], ["Taken from the account", taken, "owed", `${sumBy(rows, (r) => r.loans.length)} loans`],
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
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, reason, phone" className="min-w-0 flex-auto bg-transparent text-[14px] outline-none" />
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
              const isOpen = open === r.personId;
              const owes = p?.loanOut ?? 0;
              const repaid = p?.paidLoan ?? 0;
              const late = owes > 0 && p?.dueKind === "late";
              return (
                <li key={r.personId} style={stagger(i, 35, 420)} className="animate-fade-up border-b border-soft last:border-0">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_auto_auto]">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar text={initials(r.name)} size={40} />
                      <div className="min-w-0">
                        <Link href={`/debtors/${r.personId}`} className="block truncate text-[15px] font-medium hover:text-brand-ink hover:underline">{r.name}</Link>
                        <span className="block truncate text-[12px] text-slate-500">
                          {[r.relation, r.phone].filter(Boolean).join(" · ") || `${r.loans.length} ${r.loans.length === 1 ? "loan" : "loans"}`} · last {dateLong(r.last)}
                        </span>
                      </div>
                    </div>
                    <span className="text-right md:hidden"><Money value={r.taken} tone="owed" className="text-[15px]" /></span>
                    <div className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
                      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                        <span><span className="text-slate-500">Taken </span><Money value={r.taken} tone="owed" className="max-md:hidden" /><span className="md:hidden">{r.loans.length} {r.loans.length === 1 ? "loan" : "loans"}</span></span>
                        {owes > 0 ? <span className={late ? "font-medium text-bad" : "text-slate-600"}>owes <Money value={owes} tone={late ? "bad" : "ink"} /></span> : <Badge tone="good" className="text-[11px]">Loans repaid</Badge>}
                      </div>
                      <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-soft">
                        <span className="bar-fill block h-full rounded-full bg-owed-bar" style={{ width: `${(r.taken / maxTaken) * 100}%`, animationDelay: `${Math.min(i * 35, 420) + 120}ms` }} />
                      </span>
                      {repaid + owes > 0 && <SplitBar className="h-1.5" parts={[{ value: repaid, className: "bg-brand-2" }, { value: owes, className: late ? "bg-bad/70" : "bg-owed-bar/50" }]} />}
                    </div>
                    <span className="max-md:hidden">{owes > 0 && p?.due ? <DateChip iso={p.due} today={today} size="sm" /> : <span className="text-[12px] text-slate-400">—</span>}</span>
                    <button type="button" aria-expanded={isOpen} aria-controls={`bb-${r.personId}`} onClick={() => setOpen(isOpen ? null : r.personId)}
                      className="col-span-2 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-slate-600 hover:bg-soft hover:text-ink md:col-span-1">
                      {isOpen ? "Hide" : "Details"}<ChevronDown size={14} className={`transition-transform duration-300 ease-[var(--ease-spring)] ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  {isOpen && (
                    <div id={`bb-${r.personId}`} className="animate-fade-in border-t border-soft bg-subtle/60 px-4 py-3 sm:px-5">
                      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-slate-600">
                        <span>First loan <b className="font-medium text-ink">{dateLong(r.first)}</b></span>
                        <span>Paid back into {accountName} <Money value={r.creditedBack} tone="good" /></span>
                        <span>Repaid on all loans <Money value={repaid} tone="good" /></span>
                        <span>Still owes on loans <Money value={owes} tone={owes ? "bad" : "good"} /></span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="stack-table w-full min-w-[560px] border-collapse text-[13.5px]">
                          <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                            <th scope="col" className="py-1.5 pr-3">Date</th><th scope="col" className="py-1.5 pr-3">Reason</th><th scope="col" className="py-1.5 pr-3">How</th>
                            <th scope="col" className="py-1.5 pr-3">Due</th><th scope="col" className="py-1.5 text-right">Amount</th>
                          </tr></thead>
                          <tbody>
                            {r.loans.map((l, k) => (
                              <tr key={l.id} style={stagger(k, 40)} className="animate-fade-up border-t border-line">
                                <td className="whitespace-nowrap py-2 pr-3">{dateLong(l.iso)}</td>
                                <td data-label="Reason" className="py-2 pr-3">{l.reason}</td>
                                <td data-label="How" className="py-2 pr-3 text-slate-600">{l.method}</td>
                                <td data-label="Due" className="py-2 pr-3 text-slate-600">{l.due ? dateLong(l.due) : "—"}</td>
                                <td data-label="Amount" className="py-2 text-right"><Money value={l.amount} tone="owed" /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Link href={`/debtors/${r.personId}`} className="mt-2 inline-block text-[13px] font-medium text-brand-2 underline underline-offset-2">Open {r.name.split(" ")[0]}&apos;s full profile</Link>
                    </div>
                  )}
                </li>
              );
            })}
            {!shown.length && <li className="p-5 text-center text-[13.5px] text-slate-500">Nobody matches.</li>}
          </ul>
        </>
      ) : (
        <div className="border-t border-line p-5">
          <EmptyState compact title="Nobody has taken money from this account yet">When you add a loan taken from {accountName}, the person appears here with every loan&apos;s details.</EmptyState>
        </div>
      )}
    </SectionCard>
  );
}
