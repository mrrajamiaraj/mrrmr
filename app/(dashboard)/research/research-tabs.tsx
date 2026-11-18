"use client";

import { useState } from "react";
import { CloseIcon, PencilIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { CountUp } from "@/components/motion";
import { EmptyNote } from "@/components/debtors/bits";
import { useViewer } from "@/components/shell";
import { facilityLook, memberLook, type ResearchContribution, type ResearchExpense } from "@/lib/research";
import { dateLong, monthLabel, taka } from "@/lib/format";

export type DialogState =
  | { kind: "expense"; row: ResearchExpense | null }
  | { kind: "contribution"; row: ResearchContribution | null; member?: string }
  | { kind: "delete-expense"; row: ResearchExpense }
  | { kind: "delete-contribution"; row: ResearchContribution }
  | null;

/** ৳528.22 — keeps up to 2 decimals for averages */
export const takaDec = (n: number) =>
  `${n < 0 ? "-" : ""}৳${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const pct1 = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const select = "min-h-9 min-w-0 flex-auto cursor-pointer rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px] hover:border-slate-400 sm:flex-none";
const card = "surface-card overflow-hidden";
const hth = "px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500";

// Facilities and members are told apart by a small colour mark next to the name, not by filled badges.
function FacilityChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className="h-3 w-[3px] rounded-full" style={{ background: facilityLook(name).color }} />
      {name}
    </span>
  );
}
function MemberChip({ name }: { name: string; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: memberLook(name).dot }} />
      {name}
    </span>
  );
}
/** Edit / delete for one row. `what` names the row for screen readers ("Edit expense: BHS, ৳1,200, Oct 12"). */
function RowActions({ onEdit, onDelete, what }: { onEdit: () => void; onDelete: () => void; what: string }) {
  return (
    <span className="inline-flex gap-1">
      <button type="button" aria-label={`Edit ${what}`} title="Edit" onClick={onEdit} className="flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-soft hover:text-ink"><PencilIcon size={16} /></button>
      <button type="button" aria-label={`Delete ${what}`} title="Delete" onClick={onDelete} className="flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-bad-tint hover:text-bad"><TrashIcon size={16} /></button>
    </span>
  );
}
function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex min-h-11 w-full items-center sm:w-auto sm:min-w-[220px] sm:flex-[1_1_320px] gap-2 rounded-lg border border-line-strong bg-surface px-3.5 focus-within:border-brand-2 sm:max-w-[460px]">
      <SearchIcon size={16} className="text-slate-500" />
      <span className="sr-only">Search</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-auto bg-transparent text-[15px] outline-none" />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search"
          className="-mr-1.5 grid size-7 flex-none animate-fade-in place-items-center rounded-md text-slate-400 hover:bg-soft hover:text-ink">
          <CloseIcon size={14} />
        </button>
      )}
    </label>
  );
}

// ---- Expense Ledger ---------------------------------------------------------

export function LedgerTab({ expenses, facilities, members, setDialog }: {
  expenses: ResearchExpense[]; facilities: string[]; members: string[]; setDialog: (d: DialogState) => void;
}) {
  const viewer = useViewer();
  const [q, setQ] = useState("");
  const [fac, setFac] = useState("");
  const [mem, setMem] = useState("");
  const [month, setMonth] = useState("");
  const [sort, setSort] = useState<{ key: "date" | "amount"; dir: 1 | -1 }>({ key: "date", dir: -1 });

  const months = [...new Set(expenses.map((e) => e.spent_on.slice(0, 7)))].sort().reverse();
  const ql = q.trim().toLowerCase();
  const rows = expenses
    .filter((e) => (!fac || e.facility === fac) && (!mem || e.member === mem) && (!month || e.spent_on.startsWith(month)))
    .filter((e) => !ql || `${e.facility} ${e.member} ${e.description} ${e.tag ?? ""} ${dateLong(e.spent_on)} ${e.spent_on} ${e.amount}`.toLowerCase().includes(ql))
    .sort((a, b) =>
      sort.key === "date"
        ? sort.dir * (a.spent_on.localeCompare(b.spent_on) || a.created_at.localeCompare(b.created_at))
        : sort.dir * (a.amount - b.amount)
    );
  const sum = rows.reduce((s, e) => s + e.amount, 0);
  const toggle = (key: "date" | "amount") => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }));
  const sortBtn = (key: "date" | "amount", label: string) => (
    <button type="button" onClick={() => toggle(key)} aria-pressed={sort.key === key}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13.5px] ${sort.key === key ? "border-slate-400 bg-soft text-ink" : "border-line-strong bg-surface text-slate-600 hover:border-slate-400"}`}>
      {label}
      <span aria-hidden="true" className={`inline-block transition-transform duration-300 ease-[var(--ease-spring)] ${sort.key === key && sort.dir > 0 ? "rotate-180" : ""} ${sort.key === key ? "" : "opacity-50"}`}>
        {sort.key === key ? "↓" : "⇅"}
      </span>
    </button>
  );

  return (
    <section className={card}>
      <div className="flex flex-col gap-3 border-b border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <Search value={q} onChange={setQ} placeholder="Search by facility, person, note, date or amount…" />
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <select aria-label="Facility" value={fac} onChange={(e) => setFac(e.target.value)} className={select}>
              <option value="">All Facilities</option>
              {facilities.map((f) => <option key={f}>{f}</option>)}
            </select>
            <select aria-label="Team member" value={mem} onChange={(e) => setMem(e.target.value)} className={select}>
              <option value="">All Team Members</option>
              {members.map((m) => <option key={m}>{m}</option>)}
            </select>
            <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className={select}>
              <option value="">All Months</option>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            {sortBtn("date", "Date")}
            {sortBtn("amount", "Amount")}
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-[13px] text-slate-600">
          <span>Showing <strong>{rows.length}</strong> of <strong>{expenses.length}</strong> expenses</span>
          <span>Filtered Sum: <strong className="money text-ink"><CountUp value={sum} format={taka} duration={500} /></strong></span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="stack-table w-full min-w-[820px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-line bg-subtle text-left">
              <th scope="col" className={hth}>Date</th>
              <th scope="col" className={hth}>Facility / Center</th>
              <th scope="col" className={hth}>Personnel</th>
              <th scope="col" className={hth}>Description &amp; Note</th>
              <th scope="col" className={`${hth} text-right`}>Amount (৳)</th>
              {!viewer && <th scope="col" className={`${hth} text-right`}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-soft">
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{dateLong(e.spent_on)}</td>
                <td data-label="Facility" className="px-4 py-2.5"><FacilityChip name={e.facility} /></td>
                <td data-label="Paid by" className="px-4 py-2.5"><MemberChip name={e.member} /></td>
                <td data-label="Description" className="px-4 py-2.5">
                  <span>
                    {e.description}
                    {e.tag && <span className="ml-2 inline-block rounded border border-line bg-subtle px-1.5 py-0.5 text-[11.5px] text-slate-600">{e.tag}</span>}
                  </span>
                </td>
                <td data-label="Amount" className="money px-4 py-2.5 text-right">{taka(e.amount)}</td>
                {!viewer && <td className="stack-corner px-4 py-1.5 text-right">
                  <RowActions what={`expense: ${e.facility}, ${taka(e.amount)}, ${dateLong(e.spent_on)}`}
                    onEdit={() => setDialog({ kind: "expense", row: e })} onDelete={() => setDialog({ kind: "delete-expense", row: e })} />
                </td>}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={viewer ? 5 : 6} className="px-4 py-8 text-center text-slate-500">{expenses.length ? "No expenses match these filters." : viewer ? "No expenses yet." : "No expenses yet. Use “+ Add Expense” to log the first one."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---- Member Contributions ---------------------------------------------------

export function ContributionsTab({ contributions, members, setDialog }: {
  contributions: ResearchContribution[]; members: string[]; setDialog: (d: DialogState) => void;
}) {
  const viewer = useViewer();
  const [q, setQ] = useState("");
  const [mem, setMem] = useState("");
  const ql = q.trim().toLowerCase();
  const rows = contributions.filter(
    (c) => (!mem || c.member === mem) && (!ql || `${c.member} ${c.note ?? ""} ${dateLong(c.paid_on)} ${c.paid_on} ${c.amount}`.toLowerCase().includes(ql))
  );
  const total = contributions.reduce((s, c) => s + c.amount, 0);

  return (
    <section className={card}>
      <div className="flex flex-col gap-3 border-b border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <Search value={q} onChange={setQ} placeholder="Search by contributor, note, date or amount…" />
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <select aria-label="Contributor" value={mem} onChange={(e) => setMem(e.target.value)} className={select}>
              <option value="">All Contributors</option>
              {members.map((m) => <option key={m}>{m}</option>)}
            </select>
            {!viewer && <button type="button" onClick={() => setDialog({ kind: "contribution", row: null })}
              className="min-h-9 rounded-md border border-line-strong bg-surface px-3 text-[13.5px] hover:bg-soft">Add contribution</button>}
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-[13px] text-slate-600">
          <span>Showing <strong>{rows.length}</strong> of <strong>{contributions.length}</strong> contributions logged</span>
          <span className="text-info">Total Contributed: <strong className="money text-ink">{taka(total)}</strong></span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="stack-table w-full min-w-[680px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-line bg-subtle text-left">
              <th scope="col" className={hth}>Date</th>
              <th scope="col" className={hth}>Member Contributor</th>
              <th scope="col" className={hth}>Notes &amp; Reference</th>
              <th scope="col" className={`${hth} text-right`}>Amount (৳)</th>
              {!viewer && <th scope="col" className={`${hth} text-right`}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-soft">
                <td data-label="Date" className="whitespace-nowrap px-4 py-2.5 text-slate-600">{dateLong(c.paid_on)}</td>
                <td className="px-4 py-2.5"><MemberChip name={c.member} dot /></td>
                <td data-label="Notes" className="px-4 py-2.5 text-slate-700">{c.note ?? "—"}</td>
                <td data-label="Amount" className="money px-4 py-2.5 text-right text-info">{taka(c.amount)}</td>
                {!viewer && <td className="stack-corner px-4 py-1.5 text-right">
                  <RowActions what={`contribution: ${c.member}, ${taka(c.amount)}, ${dateLong(c.paid_on)}`}
                    onEdit={() => setDialog({ kind: "contribution", row: c })} onDelete={() => setDialog({ kind: "delete-contribution", row: c })} />
                </td>}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={viewer ? 4 : 5} className="px-4 py-8 text-center text-slate-500">{contributions.length ? "No contributions match." : "No contributions yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---- Settlement & Balances --------------------------------------------------

export function SettlementTab({ expenses, contributions, members, totalExp, totalCon, setDialog }: {
  expenses: ResearchExpense[]; contributions: ResearchContribution[]; members: string[];
  totalExp: number; totalCon: number; setDialog: (d: DialogState) => void;
}) {
  const viewer = useViewer();
  const net = totalCon - totalExp;
  const rows = members.map((m) => {
    const C = contributions.filter((c) => c.member === m);
    const contributed = C.reduce((s, c) => s + c.amount, 0);
    const spent = expenses.filter((e) => e.member === m).reduce((s, e) => s + e.amount, 0);
    return { name: m, logs: C.length, contributed, spent, net: contributed - spent, share: pct1(contributed, totalCon) };
  });
  const sign = (n: number) => (n < 0 ? "-" : n > 0 ? "+" : "+");

  return (
    <section className={card}>
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <h2 className="m-0 text-[16px] font-semibold">
            {net < 0 ? `${taka(net)} still to be covered` : net > 0 ? `${taka(net)} left over` : "Fully settled"}
          </h2>
          <div className="mt-0.5 text-[13px] text-slate-500">
            {taka(totalCon)} contributed − {taka(totalExp)} spent. Each member&apos;s net is what they put in minus what they paid for.
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="stack-table w-full min-w-[640px] border-collapse text-[14px]">
          <thead>
            <tr className="border-y border-line bg-subtle text-left">
              <th scope="col" className={hth}>Member</th>
              <th scope="col" className={`${hth} text-right`}>Contributed</th>
              <th scope="col" className={`${hth} text-right`}>Paid for</th>
              <th scope="col" className={`${hth} text-right`}>Net</th>
              <th scope="col" className={hth}>Share of contributions</th>
              {!viewer && <th scope="col" className={hth}><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-soft">
                <th scope="row" className="px-4 py-2.5 text-left font-medium"><MemberChip name={r.name} /></th>
                <td data-label="Contributed" className="money px-4 py-2.5 text-right">{taka(r.contributed)}</td>
                <td data-label="Paid for" className="money px-4 py-2.5 text-right">{taka(r.spent)}</td>
                <td data-label="Net" className={`money px-4 py-2.5 text-right ${r.net < 0 ? "text-bad" : "text-brand-2"}`}>{sign(r.net)}{taka(r.net)}</td>
                <td data-label="Share" className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line"><span className="bar-fill block h-full rounded-full bg-brand-2" style={{ width: `${r.share}%` }} /></span>
                    <span className="money text-[12.5px] text-slate-500">{r.share.toFixed(1)}%</span>
                  </span>
                </td>
                {!viewer && <td data-label="" className="px-3 py-1.5 text-right">
                  <button type="button" onClick={() => setDialog({ kind: "contribution", row: null, member: r.name })}
                    className="min-h-8 rounded-md px-2 text-[13px] text-brand-2 hover:bg-soft">Add contribution</button>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---- Facility & Team Analytics ----------------------------------------------

export function AnalyticsTab({ expenses, facilities, members, totalExp, onSettlement }: {
  expenses: ResearchExpense[]; facilities: string[]; members: string[]; totalExp: number; onSettlement: () => void;
}) {
  const group = (names: string[], key: "facility" | "member") =>
    names
      .map((n) => {
        const rows = expenses.filter((e) => e[key] === n);
        const total = rows.reduce((s, e) => s + e.amount, 0);
        return { name: n, count: rows.length, total, avg: rows.length ? total / rows.length : 0, share: pct1(total, totalExp) };
      })
      .filter((g) => g.count > 0)
      .sort((a, b) => b.total - a.total);
  const fac = group(facilities, "facility");
  const team = group(members, "member");

  if (!expenses.length) return <EmptyNote>No expenses yet — analytics appear once you add some.</EmptyNote>;

  return (
    <>
      <BreakdownTable title="By facility" sub="Where the research money was spent." label="Facility" rows={fac}
        mark={(name) => <FacilityChip name={name} />} />
      <BreakdownTable title="By member" sub="Who paid for the expenses." label="Member" rows={team}
        mark={(name) => <MemberChip name={name} />} />
      <p className="m-0 text-[13px] text-slate-500">
        To compare what each member paid against what they contributed, see{" "}
        <button type="button" onClick={onSettlement} className="text-brand-2 underline decoration-good-line underline-offset-2">Settlement</button>.
      </p>
    </>
  );
}

type Breakdown = { name: string; count: number; total: number; avg: number; share: number };

function BreakdownTable({ title, sub, label, rows, mark }: {
  title: string; sub: string; label: string; rows: Breakdown[]; mark: (name: string) => React.ReactNode;
}) {
  return (
    <section className={card}>
      <div className="px-4 pb-3 pt-4">
        <h2 className="m-0 text-[16px] font-semibold">{title}</h2>
        <div className="mt-0.5 text-[13px] text-slate-500">{sub}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="stack-table w-full min-w-[640px] border-collapse text-[14px]">
          <thead>
            <tr className="border-y border-line bg-subtle text-left">
              <th scope="col" className={hth}>{label}</th>
              <th scope="col" className={`${hth} text-right`}>Expenses</th>
              <th scope="col" className={`${hth} text-right`}>Average</th>
              <th scope="col" className={`${hth} text-right`}>Total</th>
              <th scope="col" className={hth}>Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-soft last:border-0">
                <th scope="row" className="px-4 py-2.5 text-left font-medium">{mark(r.name)}</th>
                <td data-label="Expenses" className="money px-4 py-2.5 text-right text-slate-600">{r.count}</td>
                <td data-label="Average" className="money px-4 py-2.5 text-right text-slate-600">{takaDec(Math.round(r.avg * 100) / 100)}</td>
                <td data-label="Total" className="money px-4 py-2.5 text-right">{taka(r.total)}</td>
                <td data-label="Share" className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-28 overflow-hidden rounded-full bg-line"><span className="bar-fill block h-full rounded-full bg-brand-2" style={{ width: `${r.share}%` }} /></span>
                    <span className="money text-[12.5px] text-slate-500">{r.share}%</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---- Monthly Trends ---------------------------------------------------------

export function MonthlyTab({ expenses }: { expenses: ResearchExpense[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const map = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    const k = e.spent_on.slice(0, 7);
    const m = map.get(k) ?? { total: 0, count: 0 };
    m.total += e.amount;
    m.count += 1;
    map.set(k, m);
  }
  const months = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ key: k, ...v, avg: v.total / v.count }));
  const max = Math.max(1, ...months.map((m) => m.total));
  const years = [...new Set(months.map((m) => m.key.slice(0, 4)))];

  if (!months.length) return <EmptyNote>No expenses yet — monthly trends appear once you add some.</EmptyNote>;

  return (
    <section className={`${card} flex flex-col gap-5 p-4 sm:p-5`}>
      <div>
        <h2 className="m-0 text-[16px] font-semibold">Spending by month, {years.join("–")}</h2>
        <div className="mt-0.5 text-[13px] text-slate-500">{monthLabel(months[0].key)} to {monthLabel(months[months.length - 1].key)}. Hover or tap a bar for details.</div>
      </div>

      {/* Single-series bar chart: one hue, no legend; hover a bar for its values. Cards below double as the table view. */}
      <div className="overflow-x-auto">
        {/* ~52px per month: fits a phone screen for half a year, scrolls sideways beyond that. */}
        <div className="relative flex items-end gap-2 border-b border-line-strong px-2 pt-8 sm:gap-4" style={{ height: 260, minWidth: months.length * 52 }} role="img"
          aria-label={`Monthly spending: ${months.map((m) => `${monthLabel(m.key)} ${taka(m.total)}`).join(", ")}`}>
          {/* Quarter gridlines, labelled at the right edge. */}
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <div key={f} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-soft"
              style={{ bottom: `calc(${f} * (100% - 32px))` }}>
              <span className="absolute -top-2.5 right-0 bg-surface pl-1.5 text-[10.5px] text-slate-400 tabular-nums">{taka(max * f)}</span>
            </div>
          ))}
          {months.map((m, i) => {
            const on = hover === m.key;
            return (
              <div key={m.key} className="relative flex h-full flex-1 cursor-pointer flex-col items-center justify-end"
                onMouseEnter={() => setHover(m.key)} onMouseLeave={() => setHover(null)}
                onClick={() => setHover((h) => (h === m.key ? null : m.key))}>
                {on && (
                  <div className="pointer-events-none absolute z-10 mb-2 animate-pop-in whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-xs text-on-ink shadow-[var(--shadow-pop)]"
                    style={{ bottom: `${(m.total / max) * 100}%` }}>
                    <div className="font-semibold">{monthLabel(m.key)}</div>
                    <div className="money text-[13px]">{taka(m.total)}</div>
                    <div className="text-on-ink/60">{m.count} logs · avg {takaDec(Math.round(m.avg))}</div>
                    <span aria-hidden="true" className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-ink" />
                  </div>
                )}
                <div className={`w-full max-w-[44px] origin-bottom animate-grow-y rounded-t-md bg-gradient-to-t from-brand to-brand-2 transition-[opacity,filter] duration-200 ${
                  hover && !on ? "opacity-35" : "opacity-100"} ${on ? "brightness-110" : ""}`}
                  style={{ height: `${Math.max((m.total / max) * 100, 1.5)}%`, animationDelay: `${Math.min(i * 50, 600)}ms` }} />
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 px-2 pt-2 sm:gap-4" style={{ minWidth: months.length * 52 }}>
          {months.map((m) => (
            <div key={m.key} className={`min-w-0 flex-1 text-center text-[11.5px] font-medium leading-tight transition-colors sm:text-[13px] ${hover === m.key ? "text-brand-ink" : "text-slate-700"}`}>
              {monthLabel(m.key)}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(150px,100%),1fr))] gap-3">
        {months.map((m) => (
          <button key={m.key} type="button" onMouseEnter={() => setHover(m.key)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(m.key)} onBlur={() => setHover(null)}
            className={`rounded-r-lg border-l-2 py-1.5 pl-3 text-left ${hover === m.key ? "border-brand-2 bg-good-tint" : "border-line hover:bg-subtle"}`}>
            <div className="text-[12.5px] text-slate-500">{monthLabel(m.key)}</div>
            <div className="money text-[16px]">{taka(m.total)}</div>
            <div className="text-[12px] text-slate-500">{m.count} expenses · avg {takaDec(Math.round(m.avg * 100) / 100)}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
