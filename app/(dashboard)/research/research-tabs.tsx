"use client";

// The five Research ledger views. Every figure is from lib/research-stats or lib/money (exact, tested); the charts are
// components/research-viz. Charts double as filters: click a facility, member, day, cell, tag or month to narrow the list.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CloseIcon, InIcon, OutIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { CountUp, stagger } from "@/components/motion";
import { EmptyNote } from "@/components/debtors/bits";
import { useViewer } from "@/components/shell";
import { Badge } from "@/components/ui";
import { CONTRIB, CalendarHeat, Diverging, Donut, FlowChart, Heatmap, Mark, SPENT } from "@/components/research-viz";
import { facilityLook, memberLook, type ResearchContribution, type ResearchExpense } from "@/lib/research";
import { breakdown, dailyTotals, filterExpenses, matrix, memberBalances, monthlyFlow } from "@/lib/research-stats";
import { sumBy } from "@/lib/money";
import { dateLong, initials, monthLabel, taka } from "@/lib/format";

export type DialogState =
  | { kind: "expense"; row: ResearchExpense | null }
  | { kind: "contribution"; row: ResearchContribution | null; member?: string }
  | { kind: "delete-expense"; row: ResearchExpense }
  | { kind: "delete-contribution"; row: ResearchContribution }
  | null;

/** The Expenses list's filters. Kept by the page, so other views can open the list already filtered. */
export type LedgerFilter = { q: string; fac: string; mem: string; month: string; day: string };
export const NO_FILTER: LedgerFilter = { q: "", fac: "", mem: "", month: "", day: "" };

/** ৳528.22 — keeps up to 2 decimals for averages */
export const takaDec = (n: number) =>
  `${n < 0 ? "-" : ""}৳${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const select = "min-h-10 min-w-0 flex-auto cursor-pointer rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px] transition-colors hover:border-slate-400 sm:flex-none";
const card = "surface-card overflow-hidden";
const hth = "px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500";
const NOTE_COLORS: Record<string, string> = { cash: "#3F9A75", "bank transfer": "#5B80B0", bkash: "#C2574A", nagad: "#A87D2E" };
const noteColor = (n: string) => NOTE_COLORS[n.trim().toLowerCase()] ?? "#8A8F98";

// ---- Small shared pieces -------------------------------------------------------------------------------------------

function FacilityChip({ name, q = "" }: { name: string; q?: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className="h-3.5 w-[3px] rounded-full" style={{ background: facilityLook(name).color }} />
      <Mark text={name} q={q} />
    </span>
  );
}
function MemberChip({ name, q = "" }: { name: string; q?: string }) {
  const c = memberLook(name).dot;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className="grid size-6 flex-none place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: c }}>{initials(name)}</span>
      <Mark text={name} q={q} />
    </span>
  );
}
function RowActions({ onEdit, onDelete, what }: { onEdit: () => void; onDelete: () => void; what: string }) {
  return (
    <span className="inline-flex gap-1 opacity-100 transition-opacity sm:opacity-40 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
      <button type="button" aria-label={`Edit ${what}`} title="Edit" onClick={onEdit} className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-transform hover:scale-110 hover:bg-soft hover:text-ink"><PencilIcon size={16} /></button>
      <button type="button" aria-label={`Delete ${what}`} title="Delete" onClick={onDelete} className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-transform hover:scale-110 hover:bg-bad-tint hover:text-bad"><TrashIcon size={16} /></button>
    </span>
  );
}
function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 focus-within:border-brand-2 sm:w-auto sm:min-w-[220px] sm:max-w-[460px] sm:flex-[1_1_320px]">
      <SearchIcon size={16} className="text-slate-500" />
      <span className="sr-only">Search</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-auto bg-transparent text-[15px] outline-none" />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search"
          className="-mr-1.5 grid size-7 flex-none animate-pop-in place-items-center rounded-md text-slate-400 hover:bg-soft hover:text-ink">
          <CloseIcon size={14} />
        </button>
      )}
    </label>
  );
}
function Head({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
      <div className="min-w-0">
        <h2 className="m-0 text-[16px] font-semibold">{title}</h2>
        {sub && <div className="mt-0.5 text-[13px] text-slate-500">{sub}</div>}
      </div>
      {action}
    </div>
  );
}
/** A removable filter pill. */
function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex animate-pop-in items-center gap-1 rounded-full border border-line-strong bg-surface py-0.5 pl-3 pr-1 text-[12.5px] font-medium shadow-[var(--shadow-card)]">
      {children}
      <button type="button" onClick={onClear} aria-label="Remove this filter" className="grid size-6 place-items-center rounded-full text-slate-400 hover:bg-soft hover:text-ink"><CloseIcon size={12} /></button>
    </span>
  );
}
/** Clickable horizontal bars (one per group); the pressed one is the active filter. */
function BarPicker({ rows, picked, onPick, colorOf, label }: {
  rows: { name: string; total: number; count: number; share: number }[]; picked: string; onPick: (n: string) => void; colorOf: (n: string) => string; label: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col gap-1 p-0">
      {rows.map((r, i) => {
        const on = picked === r.name;
        return (
          <li key={r.name} style={stagger(i, 60)} className="animate-fade-up">
            <button type="button" aria-pressed={on} onClick={() => onPick(on ? "" : r.name)}
              className={`group flex w-full flex-col gap-1.5 rounded-xl px-3 py-2 text-left transition-[background-color,box-shadow,opacity] duration-200 ${on ? "bg-subtle ring-1 ring-line-strong" : "hover:bg-subtle"} ${picked && !on ? "opacity-50 hover:opacity-100" : ""}`}>
              <span className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span className="flex items-center gap-2 font-medium"><span aria-hidden="true" className="size-2.5 rounded-full transition-transform duration-300 group-hover:scale-125" style={{ background: colorOf(r.name) }} />{r.name}</span>
                <span className="flex items-baseline gap-2"><span className="money">{taka(r.total)}</span><span className="w-12 text-right text-[11.5px] tabular-nums text-slate-500">{r.share}%</span></span>
              </span>
              <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-soft">
                <span className="bar-fill block h-full rounded-full transition-[filter] group-hover:brightness-110" style={{ width: `${(r.total / max) * 100}%`, background: colorOf(r.name), animationDelay: `${i * 80 + 150}ms` }} />
              </span>
              <span className="text-[11.5px] text-slate-500">{r.count} {r.count === 1 ? "entry" : "entries"}{on ? " · showing only this — click again to show all" : ""}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---- Expenses -------------------------------------------------------------------------------------------------------

export function LedgerTab({ expenses, facilities, members, setDialog, filter, setFilter, end }: {
  expenses: ResearchExpense[]; facilities: string[]; members: string[]; setDialog: (d: DialogState) => void;
  filter: LedgerFilter; setFilter: (f: LedgerFilter) => void; end: string;
}) {
  const viewer = useViewer();
  const [sort, setSort] = useState<{ key: "date" | "amount"; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [limit, setLimit] = useState(40);
  const set = (p: Partial<LedgerFilter>) => { setFilter({ ...filter, ...p }); setLimit(40); };
  const { q, fac, mem, month, day } = filter;

  const months = [...new Set(expenses.map((e) => e.spent_on.slice(0, 7)))].sort().reverse();
  const byFacility = useMemo(() => breakdown(expenses, (e) => e.facility, (e) => e.amount, facilities), [expenses, facilities]);
  const days = useMemo(() => dailyTotals(expenses), [expenses]);
  // The same filter function as the PDF export (lib/research-stats), so the list and its PDF always match.
  const rows = filterExpenses(expenses, filter, dateLong)
    .sort((a, b) =>
      sort.key === "date"
        ? sort.dir * (a.spent_on.localeCompare(b.spent_on) || a.created_at.localeCompare(b.created_at))
        : sort.dir * (a.amount - b.amount));
  const sum = sumBy(rows, (e) => e.amount);
  const maxAmt = Math.max(1, ...rows.map((r) => r.amount));
  const split = breakdown(rows, (e) => e.facility, (e) => e.amount, facilities);
  const active = q || fac || mem || month || day;
  const sig = `${q}|${fac}|${mem}|${month}|${day}|${sort.key}${sort.dir}`;
  const toggle = (key: "date" | "amount") => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }));
  const sortBtn = (key: "date" | "amount", label: string) => (
    <button type="button" onClick={() => toggle(key)} aria-pressed={sort.key === key}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 text-[13.5px] transition-colors ${sort.key === key ? "border-slate-400 bg-soft text-ink" : "border-line-strong bg-surface text-slate-600 hover:border-slate-400"}`}>
      {label}
      <span aria-hidden="true" className={`inline-block transition-transform duration-300 ease-[var(--ease-spring)] ${sort.key === key && sort.dir > 0 ? "rotate-180" : ""} ${sort.key === key ? "" : "opacity-50"}`}>
        {sort.key === key ? "↓" : "⇅"}
      </span>
    </button>
  );

  if (!expenses.length) {
    return <EmptyNote>{viewer ? "No expenses in this period." : "No expenses in this period. Use “Add expense” to log one."}</EmptyNote>;
  }

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className={card}>
          <Head title="Where it went" sub="Tap a facility to show only its expenses." />
          <div className="px-2 pb-3 sm:px-3"><BarPicker label="Spending by facility" rows={byFacility} picked={fac} onPick={(n) => set({ fac: n })} colorOf={(n) => facilityLook(n).color} /></div>
        </section>
        <section className={card}>
          <Head title="Spending calendar" sub="Each square is a day; deeper means more was spent." />
          <div className="px-4 pb-4 sm:px-5"><CalendarHeat days={days} end={end} selected={day} onPick={(d) => set({ day: d === day ? "" : d })} /></div>
        </section>
      </div>

      <section className={card}>
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <Search value={q} onChange={(v) => set({ q: v })} placeholder="Search by facility, person, note, date or amount…" />
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <select aria-label="Facility" value={fac} onChange={(e) => set({ fac: e.target.value })} className={select}>
                <option value="">All facilities</option>
                {facilities.map((f) => <option key={f}>{f}</option>)}
              </select>
              <select aria-label="Team member" value={mem} onChange={(e) => set({ mem: e.target.value })} className={select}>
                <option value="">All team members</option>
                {members.map((m) => <option key={m}>{m}</option>)}
              </select>
              <select aria-label="Month" value={month} onChange={(e) => set({ month: e.target.value, day: "" })} className={select}>
                <option value="">All months</option>
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              {sortBtn("date", "Date")}
              {sortBtn("amount", "Amount")}
            </div>
          </div>
          {active && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-slate-500">Showing only:</span>
              {fac && <Chip onClear={() => set({ fac: "" })}><FacilityChip name={fac} /></Chip>}
              {mem && <Chip onClear={() => set({ mem: "" })}>Paid by {mem}</Chip>}
              {month && <Chip onClear={() => set({ month: "" })}>{monthLabel(month)}</Chip>}
              {day && <Chip onClear={() => set({ day: "" })}>{dateLong(day)}</Chip>}
              {q && <Chip onClear={() => set({ q: "" })}>“{q}”</Chip>}
              <button type="button" onClick={() => set(NO_FILTER)} className="text-[12.5px] font-medium text-brand-2 underline underline-offset-2">Clear all</button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-slate-600">
            <span>Showing <strong>{rows.length}</strong> of <strong>{expenses.length}</strong> expenses</span>
            <span>{active ? "Filtered total" : "Total"}: <strong className="money text-ink"><CountUp value={sum} format={taka} duration={600} /></strong></span>
          </div>
          {split.length > 0 && (
            <div aria-hidden="true" className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-soft">
              {split.map((s, i) => <span key={`${sig}${s.name}`} title={`${s.name} ${taka(s.total)}`} className="bar-fill h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${s.share}%`, background: facilityLook(s.name).color, animationDelay: `${i * 70}ms` }} />)}
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="stack-table w-full min-w-[820px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line bg-subtle text-left">
                <th scope="col" className={hth}>Date</th>
                <th scope="col" className={hth}>Facility / center</th>
                <th scope="col" className={hth}>Paid by</th>
                <th scope="col" className={hth}>Description &amp; note</th>
                <th scope="col" className={`${hth} text-right`}>Amount (৳)</th>
                {!viewer && <th scope="col" className={`${hth} text-right`}>Actions</th>}
              </tr>
            </thead>
            <tbody key={sig}>
              {rows.slice(0, limit).map((e, k) => (
                <tr key={e.id} style={stagger(k, 22, 450)} className="group/row animate-fade-up border-b border-soft">
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                    <button type="button" onClick={() => set({ day: day === e.spent_on ? "" : e.spent_on })} title="Show only this day" className="rounded hover:text-ink hover:underline">{dateLong(e.spent_on)}</button>
                  </td>
                  <td data-label="Facility" className="px-4 py-2.5"><FacilityChip name={e.facility} q={q} /></td>
                  <td data-label="Paid by" className="px-4 py-2.5"><MemberChip name={e.member} q={q} /></td>
                  <td data-label="Description" className="px-4 py-2.5">
                    <span>
                      <Mark text={e.description} q={q} />
                      {e.tag && (
                        <button type="button" onClick={() => set({ q: e.tag ?? "" })} title="Search this tag"
                          className="ml-2 inline-block rounded-md border border-line bg-subtle px-1.5 py-0.5 text-[11.5px] text-slate-600 transition-colors hover:border-owed-line hover:bg-owed-tint hover:text-owed">
                          #<Mark text={e.tag} q={q} />
                        </button>
                      )}
                    </span>
                  </td>
                  <td data-label="Amount" className="px-4 py-2.5 text-right">
                    <span className="inline-flex flex-col items-end gap-1">
                      <span className="money">{taka(e.amount)}</span>
                      <span aria-hidden="true" className="block h-1 w-20 overflow-hidden rounded-full bg-soft max-sm:hidden">
                        <span className="bar-fill ml-auto block h-full rounded-full" style={{ width: `${Math.max((e.amount / maxAmt) * 100, 4)}%`, background: facilityLook(e.facility).color, transformOrigin: "right", animationDelay: `${Math.min(k * 22, 450) + 150}ms` }} />
                      </span>
                    </span>
                  </td>
                  {!viewer && <td className="stack-corner px-4 py-1.5 text-right">
                    <RowActions what={`expense: ${e.facility}, ${taka(e.amount)}, ${dateLong(e.spent_on)}`}
                      onEdit={() => setDialog({ kind: "expense", row: e })} onDelete={() => setDialog({ kind: "delete-expense", row: e })} />
                  </td>}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={viewer ? 5 : 6} className="px-4 py-10 text-center text-slate-500">No expenses match these filters. <button type="button" onClick={() => set(NO_FILTER)} className="font-medium text-brand-2 underline underline-offset-2">Clear filters</button></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > limit && (
          <div className="border-t border-line p-3 text-center">
            <button type="button" onClick={() => setLimit((l) => l + 60)} className="min-h-9 rounded-lg border border-line-strong bg-surface px-4 text-[13.5px] font-medium hover:bg-soft">Show more ({rows.length - limit} left)</button>
          </div>
        )}
      </section>
    </>
  );
}

// ---- Contributions -------------------------------------------------------------------------------------------------

export function ContributionsTab({ contributions, members, setDialog }: {
  contributions: ResearchContribution[]; members: string[]; setDialog: (d: DialogState) => void;
}) {
  const viewer = useViewer();
  const [q, setQ] = useState("");
  const [mem, setMem] = useState("");
  const [note, setNote] = useState("");
  const ql = q.trim().toLowerCase();
  const byMember = useMemo(() => breakdown(contributions, (c) => c.member, (c) => c.amount, members), [contributions, members]);
  const byNote = useMemo(() => breakdown(contributions, (c) => c.note ?? "No note", (c) => c.amount), [contributions]);
  const rows = contributions.filter((c) => (!mem || c.member === mem) && (!note || (c.note ?? "No note") === note)
    && (!ql || `${c.member} ${c.note ?? ""} ${dateLong(c.paid_on)} ${c.paid_on} ${c.amount}`.toLowerCase().includes(ql)));
  const total = sumBy(rows, (c) => c.amount);
  const maxAmt = Math.max(1, ...rows.map((r) => r.amount));
  const sig = `${q}|${mem}|${note}`;

  if (!contributions.length) return <EmptyNote>No contributions in this period{viewer ? "." : " — use “Record contribution” to add one."}</EmptyNote>;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className={card}>
          <Head title="Who put money in" sub="Tap a slice to show only that member." />
          <div className="px-4 pb-4 sm:px-5">
            <Donut title="Contributions by member" centerLabel="Contributed" picked={mem || undefined} onPick={(n) => setMem(mem === n ? "" : n)}
              slices={byMember.map((s) => ({ name: s.name, value: s.total, color: memberLook(s.name).dot, sub: `${s.count} payments · avg ${takaDec(s.avg)}` }))} />
          </div>
        </section>
        <section className={card}>
          <Head title="How it was paid" sub="Tap a method to filter." />
          <div className="px-2 pb-3 sm:px-3"><BarPicker label="Contributions by payment method" rows={byNote} picked={note} onPick={setNote} colorOf={noteColor} /></div>
        </section>
      </div>

      <section className={card}>
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <Search value={q} onChange={setQ} placeholder="Search by contributor, note, date or amount…" />
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <select aria-label="Contributor" value={mem} onChange={(e) => setMem(e.target.value)} className={select}>
                <option value="">All contributors</option>
                {members.map((m) => <option key={m}>{m}</option>)}
              </select>
              {!viewer && <button type="button" onClick={() => setDialog({ kind: "contribution", row: null, member: mem || undefined })}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] font-medium hover:bg-soft"><PlusIcon size={14} />Add contribution</button>}
            </div>
          </div>
          {(mem || note) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-slate-500">Showing only:</span>
              {mem && <Chip onClear={() => setMem("")}>{mem}</Chip>}
              {note && <Chip onClear={() => setNote("")}>{note}</Chip>}
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2 text-[13px] text-slate-600">
            <span>Showing <strong>{rows.length}</strong> of <strong>{contributions.length}</strong> contributions</span>
            <span className="text-info">{mem || note || q ? "Filtered total" : "Total contributed"}: <strong className="money text-ink"><CountUp value={total} format={taka} duration={600} /></strong></span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="stack-table w-full min-w-[680px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line bg-subtle text-left">
                <th scope="col" className={hth}>Date</th>
                <th scope="col" className={hth}>Member</th>
                <th scope="col" className={hth}>Notes &amp; reference</th>
                <th scope="col" className={`${hth} text-right`}>Amount (৳)</th>
                {!viewer && <th scope="col" className={`${hth} text-right`}>Actions</th>}
              </tr>
            </thead>
            <tbody key={sig}>
              {rows.map((c, k) => (
                <tr key={c.id} style={stagger(k, 25, 450)} className="group/row animate-fade-up border-b border-soft">
                  <td data-label="Date" className="whitespace-nowrap px-4 py-2.5 text-slate-600">{dateLong(c.paid_on)}</td>
                  <td className="px-4 py-2.5"><MemberChip name={c.member} q={q} /></td>
                  <td data-label="Notes" className="px-4 py-2.5 text-slate-700">
                    {c.note ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[12.5px]">
                        <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: noteColor(c.note) }} /><Mark text={c.note} q={q} />
                      </span>
                    ) : "—"}
                  </td>
                  <td data-label="Amount" className="px-4 py-2.5 text-right">
                    <span className="inline-flex flex-col items-end gap-1">
                      <span className="money text-info">{taka(c.amount)}</span>
                      <span aria-hidden="true" className="block h-1 w-20 overflow-hidden rounded-full bg-soft max-sm:hidden">
                        <span className="bar-fill ml-auto block h-full rounded-full" style={{ width: `${Math.max((c.amount / maxAmt) * 100, 4)}%`, background: CONTRIB, transformOrigin: "right", animationDelay: `${Math.min(k * 25, 450) + 150}ms` }} />
                      </span>
                    </span>
                  </td>
                  {!viewer && <td className="stack-corner px-4 py-1.5 text-right">
                    <RowActions what={`contribution: ${c.member}, ${taka(c.amount)}, ${dateLong(c.paid_on)}`}
                      onEdit={() => setDialog({ kind: "contribution", row: c })} onDelete={() => setDialog({ kind: "delete-contribution", row: c })} />
                  </td>}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={viewer ? 4 : 5} className="px-4 py-10 text-center text-slate-500">No contributions match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ---- Settlement -----------------------------------------------------------------------------------------------------

export function SettlementTab({ expenses, contributions, members, totalExp, totalCon, setDialog }: {
  expenses: ResearchExpense[]; contributions: ResearchContribution[]; members: string[];
  totalExp: number; totalCon: number; setDialog: (d: DialogState) => void;
}) {
  const viewer = useViewer();
  const net = totalCon - totalExp;
  const rows = useMemo(() => memberBalances(expenses, contributions, members), [expenses, contributions, members]);
  const maxBar = Math.max(1, ...rows.flatMap((r) => [r.contributed, r.spent]));
  const cover = totalExp ? (totalCon / totalExp) * 100 : totalCon ? 100 : 0;
  const R = 52;

  return (
    <>
      <section className={`${card} spot grid gap-6 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-6`}>
        <div className="relative mx-auto grid size-[140px] place-items-center">
          <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-soft)" strokeWidth="10" />
            <circle cx="60" cy="60" r={R} fill="none" stroke={cover >= 100 ? "var(--color-brand-2)" : "var(--color-owed-bar)"} strokeWidth="10" strokeLinecap="round"
              pathLength={100} strokeDasharray="100" className="viz-sweep" style={{ ["--to" as string]: 100 - Math.min(cover, 100) }} />
          </svg>
          <span className="relative flex flex-col items-center">
            <span className="money text-[26px] leading-none"><CountUp value={Math.round(cover)} format={(n) => `${Math.round(n)}%`} /></span>
            <span className="mt-1 text-[11px] text-slate-500">covered</span>
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <h2 className={`m-0 text-[20px] font-semibold ${net < 0 ? "text-bad" : "text-brand-2"}`}>
              {net < 0 ? <><CountUp value={-net} format={taka} /> still to be covered</> : net > 0 ? <><CountUp value={net} format={taka} /> left over</> : "Fully settled"}
            </h2>
            <p className="m-0 mt-1 text-[13px] text-slate-500">{taka(totalCon)} contributed − {taka(totalExp)} spent. Each member&apos;s net is what they put in minus what they paid for.</p>
          </div>
          {[["Contributed", totalCon, CONTRIB], ["Spent", totalExp, SPENT]].map(([l, v, c], i) => (
            <div key={l as string} className="grid grid-cols-[84px_1fr_auto] items-center gap-3 text-[13px]">
              <span className="text-slate-600">{l}</span>
              <span aria-hidden="true" className="h-3 overflow-hidden rounded-full bg-soft">
                <span className="bar-fill block h-full rounded-full" style={{ width: `${((v as number) / Math.max(totalCon, totalExp, 1)) * 100}%`, background: c as string, animationDelay: `${i * 150}ms` }} />
              </span>
              <span className="money">{taka(v as number)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r, i) => {
          const c = memberLook(r.name).dot;
          return (
            <article key={r.name} style={stagger(i, 80)} className="surface-card lift spot flex animate-fade-up flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full text-[13px] font-bold text-white shadow-[var(--shadow-lift)]" style={{ background: c }}>{initials(r.name)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold">{r.name}</span>
                    <span className="block text-[11.5px] text-slate-500">{r.logs} {r.logs === 1 ? "payment" : "payments"} · {r.share}% of all put in</span>
                  </span>
                </span>
                <Badge tone={r.net < 0 ? "bad" : r.net > 0 ? "good" : "neutral"} className="text-[11px]">{r.net < 0 ? "Paid for more" : r.net > 0 ? "Put in more" : "Even"}</Badge>
              </div>
              <div className={`money text-[24px] leading-none ${r.net < 0 ? "text-bad" : r.net > 0 ? "text-brand-2" : ""}`}>
                {r.net < 0 ? "−" : r.net > 0 ? "+" : ""}<CountUp value={Math.abs(r.net)} format={taka} />
              </div>
              <dl className="m-0 flex flex-col gap-2 text-[12.5px]">
                {[["Put in", r.contributed, CONTRIB, <InIcon key="i" size={13} />], ["Paid for", r.spent, SPENT, <OutIcon key="o" size={13} />]].map(([l, v, col, icon], k) => (
                  <div key={l as string}>
                    <div className="flex justify-between"><dt className="flex items-center gap-1 text-slate-600">{icon}{l}</dt><dd className="money m-0">{taka(v as number)}</dd></div>
                    <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-soft">
                      <span className="bar-fill block h-full rounded-full" style={{ width: `${((v as number) / maxBar) * 100}%`, background: col as string, animationDelay: `${i * 80 + k * 120 + 200}ms` }} />
                    </span>
                  </div>
                ))}
              </dl>
              {!viewer && (
                <button type="button" onClick={() => setDialog({ kind: "contribution", row: null, member: r.name })}
                  className="mt-auto inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-brand-2 transition-colors hover:border-good-line hover:bg-good-tint">
                  <PlusIcon size={14} />Add contribution
                </button>
              )}
            </article>
          );
        })}
      </div>

      <section className={card}>
        <Head title="Who's ahead" sub="Each member's net, from the centre line: right put in more than they paid for, left paid for more." />
        <div className="px-4 pb-5 sm:px-5"><Diverging rows={rows.map((r) => ({ name: r.name, value: r.net, color: memberLook(r.name).dot }))} /></div>
      </section>
    </>
  );
}

// ---- By facility & member --------------------------------------------------------------------------------------

export function AnalyticsTab({ expenses, facilities, members, onSettlement, onOpenLedger }: {
  expenses: ResearchExpense[]; facilities: string[]; members: string[]; onSettlement: () => void; onOpenLedger: (f: Partial<LedgerFilter>) => void;
}) {
  const [fac, setFac] = useState("");
  const [mem, setMem] = useState("");
  const byFac = useMemo(() => breakdown(expenses, (e) => e.facility, (e) => e.amount, facilities), [expenses, facilities]);
  const byMem = useMemo(() => breakdown(expenses, (e) => e.member, (e) => e.amount, members), [expenses, members]);
  const rowsF = byFac.map((s) => s.name), colsM = byMem.map((s) => s.name);
  const m = matrix(expenses, rowsF, colsM);
  const tags = useMemo(() => breakdown(expenses.filter((e) => e.tag), (e) => e.tag ?? "", (e) => e.amount).slice(0, 8), [expenses]);
  const top = [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const maxTag = Math.max(1, ...tags.map((t) => t.total));

  if (!expenses.length) return <EmptyNote>No expenses in this period — analytics appear once you add some.</EmptyNote>;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <Head title="By facility" sub="Where the research money was spent. Tap to highlight it in the grid below." />
          <div className="px-4 pb-4 sm:px-5">
            <Donut title="Spending by facility" centerLabel="Spent" picked={fac || undefined} onPick={(n) => setFac(fac === n ? "" : n)}
              slices={byFac.map((s) => ({ name: s.name, value: s.total, color: facilityLook(s.name).color, sub: `${s.count} entries · avg ${takaDec(s.avg)}` }))} />
          </div>
        </section>
        <section className={card}>
          <Head title="By member" sub="Who paid for the expenses. Tap to highlight." />
          <div className="px-4 pb-4 sm:px-5">
            <Donut title="Spending by member" centerLabel="Paid for" picked={mem || undefined} onPick={(n) => setMem(mem === n ? "" : n)}
              slices={byMem.map((s) => ({ name: s.name, value: s.total, color: memberLook(s.name).dot, sub: `${s.count} entries · avg ${takaDec(s.avg)}` }))} />
          </div>
        </section>
      </div>

      <section className={card}>
        <Head title="Facility × member" sub="Who paid for what, where. Tap a cell to open those expenses."
          action={(fac || mem) && <button type="button" onClick={() => { setFac(""); setMem(""); }} className="animate-pop-in text-[13px] font-medium text-brand-2 underline underline-offset-2">Clear highlight</button>} />
        <div className="px-3 pb-4 sm:px-4">
          <Heatmap rows={rowsF} cols={colsM} max={m.max} focus={{ row: fac || undefined, col: mem || undefined }}
            cells={m.cells.map((c) => ({ row: c.facility, col: c.member, total: c.total, count: c.count }))}
            rowMark={(n) => <FacilityChip name={n} />} colMark={(n) => <MemberChip name={n} />}
            onPick={(f, mm) => onOpenLedger({ fac: f, mem: mm })} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <Head title="Top tags" sub={tags.length ? "Tap a tag to see its expenses." : undefined} />
          {tags.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 px-2 pb-3 sm:px-3">
              {tags.map((t, i) => (
                <li key={t.name} style={stagger(i, 50)} className="animate-fade-up">
                  <button type="button" onClick={() => onOpenLedger({ q: t.name })} className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-3 py-1.5 text-left hover:bg-subtle">
                    <span className="truncate text-[13.5px] font-medium">#{t.name}</span>
                    <span className="money text-[13px]">{taka(t.total)}</span>
                    <span aria-hidden="true" className="col-span-2 block h-1.5 overflow-hidden rounded-full bg-soft">
                      <span className="bar-fill block h-full rounded-full bg-owed-bar transition-[filter] group-hover:brightness-110" style={{ width: `${(t.total / maxTag) * 100}%`, animationDelay: `${i * 60 + 150}ms` }} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="m-0 px-4 pb-4 text-[13px] text-slate-500 sm:px-5">No tagged expenses in this period.</p>}
        </section>
        <section className={card}>
          <Head title="Largest expenses" sub="The five biggest in this period." />
          <ol className="m-0 flex list-none flex-col gap-1 px-2 pb-3 sm:px-3">
            {top.map((e, i) => (
              <li key={e.id} style={stagger(i, 60)} className="animate-fade-up">
                <button type="button" onClick={() => onOpenLedger({ day: e.spent_on, fac: e.facility })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-subtle">
                  <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-full bg-soft text-[12.5px] font-bold text-slate-600">{i + 1}</span>
                  <span className="min-w-0 flex-auto">
                    <span className="block truncate text-[13.5px] font-medium">{e.description || e.facility}</span>
                    <span className="block text-[12px] text-slate-500"><FacilityChip name={e.facility} /> · {e.member} · {dateLong(e.spent_on)}</span>
                  </span>
                  <span className="money flex-none text-[14px]">{taka(e.amount)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <p className="m-0 text-[13px] text-slate-500">
        To compare what each member paid against what they contributed, see{" "}
        <button type="button" onClick={onSettlement} className="text-brand-2 underline decoration-good-line underline-offset-2">Settlement</button>.
      </p>
    </>
  );
}

// ---- By month -------------------------------------------------------------------------------------------------------

export function MonthlyTab({ expenses, contributions, facilities, members, onOpenLedger }: {
  expenses: ResearchExpense[]; contributions: ResearchContribution[]; facilities: string[]; members: string[]; onOpenLedger: (f: Partial<LedgerFilter>) => void;
}) {
  const flow = useMemo(() => monthlyFlow(expenses, contributions), [expenses, contributions]);
  const [key, setKey] = useState<string | null>(null);
  const i = key ? flow.findIndex((m) => m.key === key) : flow.length - 1;
  const cur = flow[i] ?? flow[flow.length - 1];

  if (!cur) return <EmptyNote>Nothing recorded in this period — monthly trends appear once you add expenses or contributions.</EmptyNote>;

  const E = expenses.filter((e) => e.spent_on.startsWith(cur.key));
  const facSplit = breakdown(E, (e) => e.facility, (e) => e.amount, facilities);
  const memSplit = breakdown(E, (e) => e.member, (e) => e.amount, members);
  const top = [...E].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const prev = flow[i - 1];
  const delta = prev ? cur.spent - prev.spent : 0;
  const maxBoth = Math.max(1, ...flow.flatMap((m) => [m.spent, m.contributed]));
  const go = (j: number) => flow[j] && setKey(flow[j].key);

  return (
    <>
      <section className={`${card} p-4 sm:p-5`}>
        <div className="mb-3">
          <h2 className="m-0 text-[16px] font-semibold">Money in and out, month by month</h2>
          <div className="mt-0.5 text-[13px] text-slate-500">{monthLabel(flow[0].key)} to {monthLabel(flow[flow.length - 1].key)}. Tap a month (or use ←/→) to open it below.</div>
        </div>
        <FlowChart months={flow} selected={cur.key} onSelect={setKey} />
      </section>

      <section aria-label={`${monthLabel(cur.key)} in detail`} className={`${card} spot`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <button type="button" onClick={() => go(i - 1)} disabled={i <= 0} aria-label="Previous month" className="grid size-9 place-items-center rounded-lg border border-line-strong bg-surface transition-transform hover:-translate-x-0.5 disabled:opacity-40"><ChevronLeft size={16} /></button>
          <h3 key={cur.key} className="m-0 min-w-[140px] animate-fade-up text-center font-display text-[24px] font-normal">{monthLabel(cur.key)}</h3>
          <button type="button" onClick={() => go(i + 1)} disabled={i >= flow.length - 1} aria-label="Next month" className="grid size-9 place-items-center rounded-lg border border-line-strong bg-surface transition-transform hover:translate-x-0.5 disabled:opacity-40"><ChevronRight size={16} /></button>
          {prev && cur.spent + prev.spent > 0 && (
            <Badge tone={delta > 0 ? "owed" : delta < 0 ? "good" : "neutral"} className="ml-1">
              Spending {delta > 0 ? "up" : delta < 0 ? "down" : "flat"} {delta ? taka(delta) : ""} vs {monthLabel(prev.key).split(" ")[0]}
            </Badge>
          )}
          {E.length > 0 && <button type="button" onClick={() => onOpenLedger({ month: cur.key })} className="ml-auto text-[13px] font-medium text-brand-2 underline underline-offset-2">See all {E.length} expenses</button>}
        </div>

        <div className="grid grid-cols-2 border-b border-line lg:grid-cols-4 [&>*]:border-line [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+3)]:border-t-0 [&>*+*]:border-l max-lg:[&>*:nth-child(3)]:border-l-0">
          {([["Spent", cur.spent, "owed", `${cur.count} ${cur.count === 1 ? "expense" : "expenses"}`], ["Contributed", cur.contributed, "info", "this month"],
            ["Month's net", cur.net, cur.net < 0 ? "bad" : "good", "contributed − spent"], ["Running balance", cur.running, cur.running < 0 ? "bad" : "good", "since the first record"]] as const).map(([l, v, tone, note], k) => (
            <div key={l} style={stagger(k, 60)} className="flex animate-fade-up flex-col gap-1 px-4 py-4 sm:px-5">
              <span className="eyebrow">{l}</span>
              <span className={`money text-[22px] leading-tight ${tone === "owed" ? "text-owed" : tone === "info" ? "text-info" : tone === "bad" ? "text-bad" : "text-brand-2"}`}>
                {(l === "Month's net" || l === "Running balance") && v !== 0 ? (v < 0 ? "−" : "+") : ""}<CountUp value={Math.abs(v)} format={taka} duration={700} />
              </span>
              <span className="text-[12px] text-slate-500">{note}</span>
            </div>
          ))}
        </div>

        {E.length ? (
          <div key={cur.key} className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              {([["By facility", facSplit, (n: string) => facilityLook(n).color], ["By member", memSplit, (n: string) => memberLook(n).dot]] as const).map(([t, split, col]) => (
                <div key={t}>
                  <div className="eyebrow mb-2">{t}</div>
                  <div aria-hidden="true" className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-soft">
                    {split.map((s, k) => <span key={s.name} className="bar-fill h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${s.share}%`, background: col(s.name), animationDelay: `${k * 90}ms` }} />)}
                  </div>
                  <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12.5px]">
                    {split.map((s) => (
                      <li key={s.name} className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="size-2 rounded-full" style={{ background: col(s.name) }} />
                        <span className="font-medium">{s.name}</span><span className="money text-slate-500">{taka(s.total)}</span><span className="text-slate-400">{s.share}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div>
              <div className="eyebrow mb-2">Biggest this month</div>
              <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                {top.map((e, k) => (
                  <li key={e.id} style={stagger(k, 50)} className="animate-fade-up">
                    <div className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate"><span className="font-medium">{e.description || e.facility}</span> <span className="text-slate-500">· {e.member}</span></span>
                      <span className="money flex-none">{taka(e.amount)}</span>
                    </div>
                    <span aria-hidden="true" className="mt-1 block h-1 overflow-hidden rounded-full bg-soft">
                      <span className="bar-fill block h-full rounded-full" style={{ width: `${(e.amount / (top[0]?.amount || 1)) * 100}%`, background: facilityLook(e.facility).color, animationDelay: `${k * 60 + 100}ms` }} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : <p className="m-0 p-5 text-[13px] text-slate-500">No expenses in {monthLabel(cur.key)}{cur.contributed ? " — only contributions." : "."}</p>}
      </section>

      <section className={card}>
        <Head title="Every month" sub="Pick a month to open it above." />
        <div className="snap-row flex gap-2 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] sm:px-5">
          {[...flow].reverse().map((m, k) => {
            const on = m.key === cur.key;
            return (
              <button key={m.key} type="button" aria-pressed={on} onClick={() => setKey(m.key)} style={stagger(k, 30, 400)}
                className={`flex w-[118px] flex-none animate-fade-up flex-col gap-1.5 rounded-xl border p-3 text-left transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 ${on ? "border-good-line bg-good-tint" : "border-line hover:border-line-strong hover:bg-subtle"}`}>
                <span className={`text-[12px] ${on ? "font-semibold text-brand-ink" : "text-slate-500"}`}>{monthLabel(m.key)}</span>
                <span className="money text-[15px]">{taka(m.spent)}</span>
                <span aria-hidden="true" className="flex h-8 items-end gap-1">
                  <span className="viz-grow w-1/2 rounded-t" style={{ height: `${Math.max((m.spent / maxBoth) * 100, 4)}%`, background: SPENT, animationDelay: `${Math.min(k * 30, 400) + 100}ms` }} />
                  <span className="viz-grow w-1/2 rounded-t" style={{ height: `${Math.max((m.contributed / maxBoth) * 100, 4)}%`, background: CONTRIB, animationDelay: `${Math.min(k * 30, 400) + 160}ms` }} />
                </span>
                <span className="text-[11px] text-slate-500">{m.count} spent · {m.net < 0 ? "−" : "+"}{taka(m.net)}</span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
