"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell, HeaderButton, useViewer } from "@/components/shell";
import { DownloadIcon, PersonIcon, SearchIcon, ChevronRight, DueIcon, TrendIcon, WalletIcon } from "@/components/icons";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { ExportPdfDialog, RepayDialog } from "@/components/debtors/person-dialogs";
import { repayTargets } from "@/components/debtors/repay-form";
import { Avatar, Flash } from "@/components/debtors/bits";
import { Button, EmptyState, Money } from "@/components/ui";
import { usePalettePeople } from "@/components/command-palette";
import { stagger } from "@/components/motion";
import { DateChip, Ring, ShareStrip, SplitBar } from "@/components/viz";
import { buildProfiles, type Profile } from "@/lib/ledger";
import { taka } from "@/lib/format";
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
  const [exporting, setExporting] = useState(false);

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
      actions={<>
        <HeaderButton variant="outline" onClick={() => setExporting(true)}><DownloadIcon size={15} />Export all (PDF)</HeaderButton>
        <HeaderButton onClick={() => setAdding(true)}><PersonIcon size={15} />Add loan</HeaderButton>
      </>}>

      {/* Each figure is also a filter. */}
      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3">
        <Tile on={filter === "owing"} onClick={() => setFilter(filter === "owing" ? "all" : "owing")} label="Outstanding" value={sumBy(owing, (p) => p.owes)} tone="owed"
          note={`${owing.length} ${owing.length === 1 ? "person owes" : "people owe"} you`} icon={<WalletIcon size={18} />}
          visual={<>
            <SplitBar parts={[{ value: sumBy(owing, (p) => p.loanOut), className: "bg-owed-bar" }, { value: sumBy(owing, (p) => p.cardOut), className: "bg-[#2F5583]" }]} />
            <span className="flex justify-between text-[11.5px] text-slate-500"><span>Loans {taka(sumBy(owing, (p) => p.loanOut))}</span><span>Cards {taka(sumBy(owing, (p) => p.cardOut))}</span></span>
          </>} />
        <Tile on={filter === "overdue"} onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")} label="Overdue" value={sumBy(overdue, (p) => p.owes)} tone={overdue.length ? "bad" : "muted"}
          note={overdue.length ? `${overdue.length} past their due date` : "Nobody is late"} icon={<DueIcon size={18} />}
          visual={<Faces people={overdue} empty="All on time" />} />
        <Tile on={filter === "soon"} onClick={() => setFilter(filter === "soon" ? "all" : "soon")} label="Due in 7 days" value={sumBy(soon, (p) => p.owes)} tone={soon.length ? "owed" : "muted"}
          note={soon.length ? `${soon.length} ${soon.length === 1 ? "person" : "people"}` : "Nothing due this week"} icon={<TrendIcon size={18} />}
          visual={<WeekStrip today={today} dues={soon.map((p) => p.due!).filter(Boolean)} />} />
      </section>

      {owing.length > 1 && (
        <section aria-labelledby="share-h" className="surface-card reveal flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="share-h" className="m-0 text-heading font-semibold">Who owes what</h2>
            <span className="text-[12.5px] text-slate-500">Share of {taka(sumBy(owing, (p) => p.owes))}</span>
          </div>
          <ShareStrip items={owing.map((p) => ({ id: p.id, name: p.name, value: p.owes }))} hrefOf={(id) => `/debtors/${id}`} />
        </section>
      )}

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
        <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,0.75fr)_120px] gap-5 border-b border-line bg-subtle px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 md:grid">
          <span>Person</span><span>Paid back so far</span><span className="text-right">Next due</span><span />
        </div>
        <ul className="m-0 list-none p-0">
          {people.map((p, i) => {
            const s = standing(p);
            const owed = p.owes > 0;
            return (
              <li key={p.id} style={stagger(i, 30, 360)} className="relative animate-fade-up border-b border-soft last:border-0 hover:bg-subtle">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,0.75fr)_120px] md:gap-5 md:px-5">
                  {/* Who, with a ring that fills as they repay */}
                  <div className="flex min-w-0 items-center gap-3">
                    <Ring pct={p.taken ? p.pct : 0} size={48} stroke={3.5} color={s.tone === "bad" ? "var(--color-bad)" : "var(--color-brand-2)"}>
                      <Avatar text={p.initials} size={38} />
                    </Ring>
                    <div className="min-w-0">
                      <Link href={`/debtors/${p.id}`} className="block truncate rounded text-[15px] font-medium after:absolute after:inset-0 hover:text-brand-ink">{p.name}</Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[11.5px] font-medium ${CHIP[s.tone]}`}>
                          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{s.label}
                        </span>
                        <span className="truncate text-[12px] text-slate-500">{[...new Set(p.reasons)].slice(0, 2).join(", ")}</span>
                      </div>
                    </div>
                  </div>

                  {/* Mobile: outstanding on the right of the name */}
                  <span className="text-right md:hidden"><Money value={p.owes} tone={owed ? (s.tone === "bad" ? "bad" : "owed") : "good"} className="text-[16px]" /></span>

                  {/* Repaid vs still owed, as one bar with the figures under it */}
                  <div className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <Money value={p.owes} tone={owed ? (s.tone === "bad" ? "bad" : "owed") : "good"} className="text-[16px] max-md:hidden" />
                      <span className="text-[12px] text-slate-500">{owed ? `still owed of ${taka(p.taken)}` : p.taken ? "all paid back" : "nothing borrowed"}</span>
                      <span className="money text-[12px] text-brand-2">{p.taken ? `${p.pct}%` : ""}</span>
                    </div>
                    {p.taken > 0 && <SplitBar className="h-2.5" parts={[{ value: p.paid, className: "bg-gradient-to-r from-brand-2 to-[#3DAA80]" }, { value: p.owes, className: s.tone === "bad" ? "bg-bad/70" : "bg-owed-bar/80" }]} />}
                    <span className="text-[11.5px] text-slate-500">Repaid <Money value={p.paid} tone="good" /> · borrowed <Money value={p.taken} tone="muted" /></span>
                  </div>

                  <div className="flex items-center md:justify-end">
                    {owed ? <DateChip iso={p.due} today={today} /> : <span className="text-[12.5px] text-slate-400">—</span>}
                  </div>

                  <span className="relative z-10 flex items-center justify-end gap-1">
                    {!viewer && owed && (
                      <Button variant="secondary" size="sm" onClick={() => setRepaying(p)} className="max-md:min-h-10"><TrendIcon size={14} />Repay</Button>
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
      {exporting && <ExportPdfDialog personId={null} name="Everyone" today={today} initial={{ from: "", to: "" }} onClose={() => setExporting(false)} />}
      {repaying && (
        <RepayDialog p={repaying} targets={repayTargets(all.find((x) => x.id === repaying.id) ?? repaying, data.cards)} account={account}
          onClose={() => setRepaying(null)} onSaved={(t) => { setRepaying(null); setFlash(t); }} />
      )}
    </Shell>
  );
}

const CHIP = { bad: "bg-bad-tint text-bad", owed: "bg-owed-tint text-owed", good: "bg-good-tint text-brand-2", muted: "bg-soft text-slate-500" } as const;
const ICON_TONE = { owed: "bg-owed-tint text-owed", bad: "bg-bad-tint text-bad", muted: "bg-soft text-slate-500" } as const;

function Tile({ on, onClick, label, value, tone, note, icon, visual }: {
  on: boolean; onClick: () => void; label: string; value: number; tone: "owed" | "bad" | "muted"; note: string; icon: React.ReactNode; visual: React.ReactNode;
}) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`surface-card lift spot flex flex-col gap-2 p-4 text-left ${on ? "!border-ink ring-1 ring-ink" : ""}`}>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2"><span aria-hidden="true" className={`grid size-8 place-items-center rounded-lg ${ICON_TONE[tone]}`}>{icon}</span><span className="eyebrow">{label}</span></span>
        <span className="text-[11px] font-medium text-slate-400">{on ? "Filtering · tap to clear" : "Tap to filter"}</span>
      </span>
      <span className="money text-figure"><Money value={value} tone={tone} /></span>
      <span className="flex min-h-[34px] flex-col justify-end gap-1.5">{visual}</span>
      <span className="text-[12.5px] text-slate-500">{note}</span>
    </button>
  );
}

/** Overlapping faces of the people in a group (first five), or a quiet note when there are none. */
function Faces({ people, empty }: { people: Profile[]; empty: string }) {
  if (!people.length) return <span className="text-[12px] font-medium text-brand-2">✓ {empty}</span>;
  return (
    <span className="flex items-center">
      <span className="flex -space-x-2">{people.slice(0, 5).map((p) => <Avatar key={p.id} text={p.initials} size={28} />)}</span>
      {people.length > 5 && <span className="ml-2 text-[12px] text-slate-500">+{people.length - 5}</span>}
    </span>
  );
}

/** The next seven days as seven cells; a day with something due is filled. Day names are text. */
function WeekStrip({ today, dues }: { today: string; dues: string[] }) {
  const days = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + k + 1);
    const iso = d.toISOString().slice(0, 10);
    return { iso, n: dues.filter((x) => x === iso).length, label: d.toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" }) };
  });
  return (
    <span aria-hidden="true" className="grid grid-cols-7 gap-1">
      {days.map((d) => (
        <span key={d.iso} className="flex flex-col items-center gap-0.5">
          <span className={`h-5 w-full rounded-md ${d.n ? "bg-owed-bar" : "bg-soft"}`} />
          <span className="text-[10px] text-slate-400">{d.label}</span>
        </span>
      ))}
    </span>
  );
}
