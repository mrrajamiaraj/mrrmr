"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell, HeaderButton, useViewer } from "@/components/shell";
import { PersonIcon, SearchIcon, ChevronRight, DueIcon, TrendIcon } from "@/components/icons";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { RepayDialog } from "@/components/debtors/person-dialogs";
import { repayTargets } from "@/components/debtors/repay-form";
import { Avatar, Flash } from "@/components/debtors/bits";
import { Button, EmptyState, IconButton, Money } from "@/components/ui";
import { usePalettePeople } from "@/components/command-palette";
import { buildProfiles, type Profile } from "@/lib/ledger";
import { dateLong, dateShort } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { FinanceData } from "@/lib/types";

export type Filter = "all" | "owing" | "overdue" | "soon" | "repaid";
type Sort = "owes" | "due" | "name" | "recent";

/** One word for where someone stands; always text, never colour alone. */
function standing(p: Profile): { label: string; tone: "bad" | "owed" | "good" | "muted" } {
  if (p.owes <= 0) return { label: p.txCount ? "Repaid" : "No entries", tone: p.txCount ? "good" : "muted" };
  if (p.dueKind === "late") return { label: "Overdue", tone: "bad" };
  if (p.dueKind === "soon") return { label: "Due soon", tone: "owed" };
  return { label: p.paid > 0 ? "Part repaid" : "Owes", tone: "owed" };
}
const TONE = { bad: "text-bad", owed: "text-owed", good: "text-brand-2", muted: "text-slate-500" } as const;
const match = (p: Profile, f: Filter) =>
  f === "all" || (f === "repaid" ? p.owes <= 0 : p.owes > 0 && (f === "owing" || (f === "overdue" ? p.dueKind === "late" : p.dueKind === "soon")));

export function DebtorsView({ data, today, initialFilter = "all" }: { data: FinanceData; today: string; initialFilter?: Filter }) {
  const viewer = useViewer();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [sort, setSort] = useState<Sort>("owes");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const [adding, setAdding] = useState(false);
  const [repaying, setRepaying] = useState<Profile | null>(null);
  const [flash, setFlash] = useState("");

  const all = useMemo(() => buildProfiles(data, today), [data, today]);
  usePalettePeople(all, (id) => id && router.push(`/debtors/${id}`));
  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;

  const people = useMemo(() => all
    .filter((p) => match(p, filter))
    .filter((p) => !query || `${p.name} ${p.relation ?? ""} ${p.phone ?? ""} ${p.notes ?? ""} ${p.reasons.join(" ")}`.toLowerCase().includes(query))
    .sort((a, b) =>
      sort === "due" ? (a.owes > 0 && a.due ? a.due : "9999").localeCompare(b.owes > 0 && b.due ? b.due : "9999") || b.owes - a.owes
      : sort === "name" ? a.name.localeCompare(b.name)
      : sort === "recent" ? (b.lastIso ?? "").localeCompare(a.lastIso ?? "")
      : b.owes - a.owes || a.name.localeCompare(b.name)), [all, filter, query, sort]);

  const count = (f: Filter) => all.filter((p) => match(p, f)).length;
  const owing = all.filter((p) => p.owes > 0);
  const overdue = owing.filter((p) => p.dueKind === "late");
  const soon = owing.filter((p) => p.dueKind === "soon");

  const chips: [Filter, string][] = [["all", "All"], ["owing", "Owe you"], ["overdue", "Overdue"], ["soon", "Due in 7 days"], ["repaid", "Repaid"]];

  return (
    <Shell subtitle="Everyone who owes you money — bank loans and purchases on your cards — and what they've paid back."
      actions={<HeaderButton onClick={() => setAdding(true)}><PersonIcon size={15} />Add loan</HeaderButton>}>

      {/* Each figure is also a filter. */}
      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3">
        <Tile on={filter === "owing"} onClick={() => setFilter(filter === "owing" ? "all" : "owing")} label="Outstanding" value={sumBy(owing, (p) => p.owes)} tone="owed"
          note={`${owing.length} ${owing.length === 1 ? "person owes" : "people owe"} you`} />
        <Tile on={filter === "overdue"} onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")} label="Overdue" value={sumBy(overdue, (p) => p.owes)} tone={overdue.length ? "bad" : "muted"}
          note={overdue.length ? `${overdue.length} past their due date` : "Nobody is late"} />
        <Tile on={filter === "soon"} onClick={() => setFilter(filter === "soon" ? "all" : "soon")} label="Due in 7 days" value={sumBy(soon, (p) => p.owes)} tone={soon.length ? "owed" : "muted"}
          note={soon.length ? `${soon.length} ${soon.length === 1 ? "person" : "people"}` : "Nothing due this week"} />
      </section>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 min-w-0 flex-[1_1_260px] items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:border-brand-2">
            <SearchIcon size={16} className="text-slate-500" /><span className="sr-only">Search people</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, reason, phone, notes"
              className="min-w-0 flex-auto bg-transparent text-[14.5px] outline-none" />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-[13px] text-slate-500">Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-11 rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink">
              <option value="owes">Amount owed (highest)</option>
              <option value="due">Due date (soonest)</option>
              <option value="name">Name (A–Z)</option>
              <option value="recent">Recent activity</option>
            </select>
          </label>
        </div>
        <div role="group" aria-label="Filter by status" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {chips.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
              className={`inline-flex min-h-9 flex-none items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium ${filter === k ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-slate-600 hover:border-line-strong hover:text-ink"}`}>
              {l}<span className={`tabular-nums ${filter === k ? "text-on-ink/70" : "text-slate-400"}`}>{count(k)}</span>
            </button>
          ))}
        </div>
      </div>

      <Flash text={flash} />

      <section aria-label="People" className="surface-card overflow-hidden">
        <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.8fr))_minmax(0,0.9fr)_88px] gap-4 border-b border-line bg-subtle px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 md:grid">
          <span>Person</span><span className="text-right">Borrowed</span><span className="text-right">Repaid</span><span className="text-right">Outstanding</span><span>Next due</span><span />
        </div>
        <ul className="m-0 list-none p-0">
          {people.map((p) => {
            const s = standing(p);
            return (
              <li key={p.id} className="relative border-b border-soft last:border-0 hover:bg-subtle">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.8fr))_minmax(0,0.9fr)_88px] md:gap-4 md:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar text={p.initials} size={38} />
                    <div className="min-w-0">
                      <Link href={`/debtors/${p.id}`} className="block truncate rounded text-[15px] font-medium after:absolute after:inset-0 hover:text-brand-ink">{p.name}</Link>
                      <div className={`text-[12.5px] ${TONE[s.tone]}`}>{s.tone === "bad" && <DueIcon size={12} className="mr-1 inline" />}{s.label}
                        <span className="text-slate-500">{p.reasons.length ? ` · ${[...new Set(p.reasons)].slice(0, 2).join(", ")}` : ""}</span></div>
                    </div>
                  </div>
                  <span className="hidden text-right md:block"><Money value={p.taken} tone="muted" /></span>
                  <span className="hidden text-right md:block"><Money value={p.paid} tone={p.paid ? "good" : "muted"} /></span>
                  <span className="text-right md:order-none">
                    <Money value={p.owes} tone={p.owes ? (s.tone === "bad" ? "bad" : "owed") : "muted"} className="text-[15.5px]" />
                    {p.taken > 0 && <span aria-hidden="true" className="ml-auto mt-1 block h-1 w-20 overflow-hidden rounded-full bg-soft md:w-full"><span className="block h-full rounded-full bg-brand-2" style={{ width: `${Math.min(p.pct, 100)}%` }} /></span>}
                  </span>
                  <span className={`col-span-2 text-[13px] md:col-span-1 ${p.owes > 0 && p.dueKind === "late" ? "font-medium text-bad" : "text-slate-600"}`}>
                    <span className="text-slate-500 md:hidden">Next due </span>
                    {p.owes > 0 ? (p.due ? <><span className="md:hidden">{dateShort(p.due)}</span><span className="max-md:hidden">{dateLong(p.due)}</span></> : "No date set") : "—"}
                    <span className="text-slate-500 md:hidden"> · borrowed <Money value={p.taken} tone="muted" /> · repaid <Money value={p.paid} tone="muted" /></span>
                  </span>
                  <span className="relative z-10 col-span-2 flex items-center justify-end gap-1 max-md:-mt-1 md:col-span-1">
                    {!viewer && p.owes > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setRepaying(p)} className="max-md:min-h-10"><TrendIcon size={14} />Repay</Button>
                    )}
                    <ChevronRight size={16} className="flex-none text-slate-400 max-md:hidden" />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {!people.length && (
          <div className="p-5">
            <EmptyState compact title={all.length ? "Nobody matches" : "No people yet"}
              action={all.length ? <Button variant="secondary" size="sm" onClick={() => { setQ(""); setFilter("all"); }}>Clear search and filters</Button>
                : !viewer ? <Button size="sm" onClick={() => setAdding(true)}>Add the first loan</Button> : undefined}>
              {all.length ? "Try another name, or a different status." : "When you lend money or someone uses your card, they appear here."}
            </EmptyState>
          </div>
        )}
      </section>

      {adding && (
        <AddDebtorDialog mode="loan" extended title="Add a loan" submitLabel="Add loan" account={account} knownNames={data.people.map((p) => p.name)}
          onClose={() => setAdding(false)} onAdded={(personId, text) => { setAdding(false); setFlash(text); if (personId) router.push(`/debtors/${personId}`); }} />
      )}
      {repaying && (
        <RepayDialog p={repaying} targets={repayTargets(all.find((x) => x.id === repaying.id) ?? repaying, data.cards)} account={account}
          onClose={() => setRepaying(null)} onSaved={(t) => { setRepaying(null); setFlash(t); }} />
      )}
    </Shell>
  );
}

function Tile({ on, onClick, label, value, tone, note }: { on: boolean; onClick: () => void; label: string; value: number; tone: "owed" | "bad" | "muted"; note: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`surface-card lift flex flex-col gap-1 p-4 text-left ${on ? "!border-ink ring-1 ring-ink" : ""}`}>
      <span className="eyebrow flex items-center justify-between">{label}<span className="text-[11px] font-medium normal-case tracking-normal text-slate-400">{on ? "Filtering · tap to clear" : "Tap to filter"}</span></span>
      <Money value={value} tone={tone} className="text-figure" />
      <span className="text-[12.5px] text-slate-500">{note}</span>
    </button>
  );
}
