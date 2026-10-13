"use client";

import { useState } from "react";
import { PencilIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { EmptyNote } from "@/components/debtors/bits";
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
const select = "min-h-10 rounded-[10px] border border-[#CBD5E1] bg-white px-3 text-sm";
const card = "overflow-hidden rounded-2xl border border-line bg-white";

function FacilityChip({ name }: { name: string }) {
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[13px] font-semibold ${facilityLook(name).chip}`}>{name}</span>;
}
function MemberChip({ name, dot = false }: { name: string; dot?: boolean }) {
  const l = memberLook(name);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${l.chip}`}>
      {dot && <span className="size-1.5 rounded-full" style={{ background: l.dot }} />}
      {name}
    </span>
  );
}
function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="inline-flex gap-1">
      <button type="button" aria-label="Edit" title="Edit" onClick={onEdit} className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-soft"><PencilIcon size={16} /></button>
      <button type="button" aria-label="Delete" title="Delete" onClick={onDelete} className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-[#FEE2E2] hover:text-[#B91C1C]"><TrashIcon size={16} /></button>
    </span>
  );
}
function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex min-h-11 min-w-[220px] flex-[1_1_320px] items-center gap-2 rounded-[10px] border border-[#CBD5E1] bg-white px-3.5 sm:max-w-[460px]">
      <SearchIcon size={16} className="text-slate-500" />
      <span className="sr-only">Search</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-auto bg-transparent text-[15px] outline-none" />
    </label>
  );
}

// ---- Expense Ledger ---------------------------------------------------------

export function LedgerTab({ expenses, facilities, members, setDialog }: {
  expenses: ResearchExpense[]; facilities: string[]; members: string[]; setDialog: (d: DialogState) => void;
}) {
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
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border px-3 text-sm font-semibold ${sort.key === key ? "border-[#94A3B8] bg-soft text-ink" : "border-[#CBD5E1] bg-white text-slate-600"}`}>
      {label} <span aria-hidden="true">{sort.key === key ? (sort.dir < 0 ? "↓" : "↑") : "⇅"}</span>
    </button>
  );

  return (
    <section className={card}>
      <div className="flex flex-col gap-3 border-b border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <Search value={q} onChange={setQ} placeholder="Search by facility, person, note, date or amount…" />
          <div className="flex flex-wrap items-center gap-2">
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
          <span>Filtered Sum: <strong className="font-mono text-ink">{taka(sum)}</strong></span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-[14.5px]">
          <thead>
            <tr className="border-b border-line bg-[#F8FAFC] text-left">
              <th scope="col" className="px-4 py-3 font-semibold">Date</th>
              <th scope="col" className="px-4 py-3 font-semibold">Facility / Center</th>
              <th scope="col" className="px-4 py-3 font-semibold">Personnel</th>
              <th scope="col" className="px-4 py-3 font-semibold">Description &amp; Note</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Amount (৳)</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-soft">
                <td className="whitespace-nowrap px-4 py-2.5 font-medium">{dateLong(e.spent_on)}</td>
                <td className="px-4 py-2.5"><FacilityChip name={e.facility} /></td>
                <td className="px-4 py-2.5"><MemberChip name={e.member} /></td>
                <td className="px-4 py-2.5">
                  {e.description}
                  {e.tag && <span className="ml-2 rounded border border-line bg-[#F8FAFC] px-1.5 py-0.5 text-[11.5px] text-slate-600">{e.tag}</span>}
                </td>
                <td className="money px-4 py-2.5 text-right">{taka(e.amount)}</td>
                <td className="px-4 py-1.5 text-right">
                  <RowActions onEdit={() => setDialog({ kind: "expense", row: e })} onDelete={() => setDialog({ kind: "delete-expense", row: e })} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">{expenses.length ? "No expenses match these filters." : "No expenses yet. Use “+ Add Expense” to log the first one."}</td></tr>
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
          <div className="flex flex-wrap gap-2">
            <select aria-label="Contributor" value={mem} onChange={(e) => setMem(e.target.value)} className={select}>
              <option value="">All Contributors</option>
              {members.map((m) => <option key={m}>{m}</option>)}
            </select>
            <button type="button" onClick={() => setDialog({ kind: "contribution", row: null })}
              className="min-h-10 rounded-[10px] bg-[#4F46E5] px-4 text-sm font-semibold text-white">+ Add Contribution</button>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-[13px] text-slate-600">
          <span>Showing <strong>{rows.length}</strong> of <strong>{contributions.length}</strong> contributions logged</span>
          <span className="text-[#4338CA]">Total Contributed: <strong className="font-mono text-ink">{taka(total)}</strong></span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-[14.5px]">
          <thead>
            <tr className="border-b border-line bg-[#F8FAFC] text-left">
              <th scope="col" className="px-4 py-3 font-semibold">Date</th>
              <th scope="col" className="px-4 py-3 font-semibold">Member Contributor</th>
              <th scope="col" className="px-4 py-3 font-semibold">Notes &amp; Reference</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Amount (৳)</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-soft">
                <td className="whitespace-nowrap px-4 py-2.5 font-semibold">{dateLong(c.paid_on)}</td>
                <td className="px-4 py-2.5"><MemberChip name={c.member} dot /></td>
                <td className="px-4 py-2.5 text-slate-700">{c.note ?? "—"}</td>
                <td className="money px-4 py-2.5 text-right text-[#4338CA]">{taka(c.amount)}</td>
                <td className="px-4 py-1.5 text-right">
                  <RowActions onEdit={() => setDialog({ kind: "contribution", row: c })} onDelete={() => setDialog({ kind: "delete-contribution", row: c })} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">{contributions.length ? "No contributions match." : "No contributions yet."}</td></tr>
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
  const net = totalCon - totalExp;
  const rows = members.map((m) => {
    const C = contributions.filter((c) => c.member === m);
    const contributed = C.reduce((s, c) => s + c.amount, 0);
    const spent = expenses.filter((e) => e.member === m).reduce((s, e) => s + e.amount, 0);
    return { name: m, logs: C.length, contributed, spent, net: contributed - spent, share: pct1(contributed, totalCon) };
  });
  const sign = (n: number) => (n < 0 ? "-" : n > 0 ? "+" : "+");

  return (
    <section className={`${card} flex flex-col gap-5 p-5`}>
      <div>
        <h2 className="m-0 text-xl font-bold">Money Contributions &amp; Settlement</h2>
        <div className="text-sm text-slate-500">Direct reconciliation between member contributions and research expenses</div>
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3.5 ${net < 0 ? "border-[#FDE68A] bg-[#FFFBEB]" : "border-[#A7F3D0] bg-[#ECFDF5]"}`}>
        <div>
          <div className={`font-bold ${net < 0 ? "text-[#92400E]" : "text-[#065F46]"}`}>
            {net < 0 ? `Settlement Deficit: ${taka(net)} remaining` : net > 0 ? `Settlement Surplus: ${taka(net)}` : "Fully settled"}
          </div>
          <div className="text-sm text-slate-700">
            {net < 0 ? "Additional member contributions are required to balance total research expenses incurred." : "Contributions cover all research expenses."}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-white px-3 py-1.5 font-mono text-[13px]">
          Net: {taka(totalCon)} − {taka(totalExp)} = <span className={net < 0 ? "font-bold text-[#BE123C]" : "font-bold text-[#047857]"}>{net < 0 ? "-" : ""}{taka(net)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="font-bold uppercase tracking-[0.04em]">Member contributor financial balance</span>
        <span className="text-slate-500">{members.length} contributors tracked</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        {rows.map((r) => (
          <div key={r.name} className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 ${memberLook(r.name).card}`}>
            <div className="flex items-center justify-between"><MemberChip name={r.name} dot /><span className="text-[13px] text-slate-500">{r.logs} logs</span></div>
            <div>
              <div className="text-xs font-semibold uppercase text-slate-600">Total contributed</div>
              <div className="money text-[26px]">{taka(r.contributed)}</div>
            </div>
            <dl className="m-0 flex flex-col gap-1 border-t border-soft pt-2.5 text-[13.5px]">
              <div className="flex justify-between"><dt className="text-slate-600">Expenses Incurred:</dt><dd className="m-0 font-mono">{taka(r.spent)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">Net Balance:</dt>
                <dd className={`m-0 font-mono font-bold ${r.net < 0 ? "text-[#BE123C]" : "text-[#047857]"}`}>{sign(r.net)}{taka(r.net)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">Contribution Share:</dt><dd className="m-0 font-mono">{r.share.toFixed(1)}%</dd></div>
            </dl>
            <button type="button" onClick={() => setDialog({ kind: "contribution", row: null, member: r.name })}
              className="min-h-10 rounded-[10px] border border-line bg-[#F8FAFC] text-sm font-semibold text-slate-700">+ Record Contribution</button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-[#F8FAFC] p-4">
        <div className="flex justify-between text-sm"><span className="font-semibold text-slate-700">Proportional Member Contribution Stack</span><span>Total: <strong className="font-mono">{taka(totalCon)}</strong></span></div>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-md bg-[#E2E8F0]">
          {rows.filter((r) => r.contributed > 0).map((r) => (
            <div key={r.name} title={`${r.name}: ${taka(r.contributed)} (${r.share}%)`} style={{ width: `${r.share}%`, background: memberLook(r.name).bar }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-700">
          {rows.map((r) => (
            <span key={r.name} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: memberLook(r.name).bar }} />
              {r.name}: {taka(r.contributed)} ({Math.round(r.share)}%)
            </span>
          ))}
        </div>
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
      <section className={`${card} flex flex-col gap-4 p-5`}>
        <div>
          <h2 className="m-0 text-lg font-bold">Facility Category Counts &amp; Averages</h2>
          <div className="text-sm text-slate-500">Breakdown of total amounts, entry counts, and average spend per medical institution</div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
          {fac.map((f) => {
            const l = facilityLook(f.name);
            return (
              <div key={f.name} className="flex flex-col gap-3 rounded-2xl border p-4" style={{ background: l.bg, borderColor: l.border }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold uppercase tracking-[0.04em]">{f.name}</span>
                  <span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs">{f.count} expenses</span>
                </div>
                <div className="money text-2xl">{taka(f.total)}</div>
                <dl className="m-0 flex flex-col gap-1 border-t border-black/5 pt-2 text-[13px]">
                  <div className="flex justify-between"><dt className="text-slate-600">Average / Entry:</dt><dd className="m-0 font-mono font-semibold">{takaDec(Math.round(f.avg * 100) / 100)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-600">Share of Budget:</dt><dd className="m-0 font-mono">{f.share}%</dd></div>
                </dl>
                <div className="h-1.5 overflow-hidden rounded-[3px] bg-white"><div className="h-full rounded-[3px]" style={{ width: `${f.share}%`, background: l.color }} /></div>
              </div>
            );
          })}
        </div>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[640px] border-collapse text-[14.5px]">
            <thead>
              <tr className="border-b border-line bg-[#F8FAFC] text-left">
                <th scope="col" className="px-4 py-3 font-semibold">Facility Category</th>
                <th scope="col" className="px-4 py-3 text-center font-semibold">Entry Count</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Average / Expense</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Total Incurred</th>
                <th scope="col" className="px-4 py-3 font-semibold">Proportion</th>
              </tr>
            </thead>
            <tbody>
              {fac.map((f) => (
                <tr key={f.name} className="border-b border-soft">
                  <th scope="row" className="px-4 py-3 text-left font-semibold">
                    <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: facilityLook(f.name).color }} />{f.name}</span>
                  </th>
                  <td className="px-4 py-3 text-center font-mono">{f.count}</td>
                  <td className="px-4 py-3 text-right font-mono">{takaDec(Math.round(f.avg * 100) / 100)}</td>
                  <td className="money px-4 py-3 text-right">{taka(f.total)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-28 overflow-hidden rounded-[3px] bg-soft"><span className="block h-full rounded-[3px]" style={{ width: `${f.share}%`, background: facilityLook(f.name).color }} /></span>
                      <span className="font-mono text-[13px] text-slate-600">{f.share}%</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} flex flex-col gap-4 p-5`}>
        <div>
          <h2 className="m-0 text-lg font-bold">Team Member Counts &amp; Averages</h2>
          <div className="text-sm text-slate-500">Individual distribution of expenses logged by each team member</div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
          {team.map((t) => (
            <div key={t.name} className="flex flex-col gap-2.5 rounded-2xl border border-line p-4">
              <div className="flex items-center justify-between"><MemberChip name={t.name} /><span className="text-[13px] text-slate-500">{t.count} items</span></div>
              <div className="money text-2xl">{taka(t.total)}</div>
              <dl className="m-0 flex flex-col gap-1 border-t border-soft pt-2 text-[13px]">
                <div className="flex justify-between"><dt className="text-slate-600">Average:</dt><dd className="m-0 font-mono">{takaDec(Math.round(t.avg * 100) / 100)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-600">Share:</dt><dd className="m-0 font-mono">{t.share}%</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C7D2FE] bg-[#EEF2FF] px-5 py-4">
        <div>
          <div className="font-bold">Looking for Contributor Settlement &amp; Balances?</div>
          <div className="text-sm text-slate-600">Compare member contributions against expenses and check net positions.</div>
        </div>
        <button type="button" onClick={onSettlement} className="min-h-11 rounded-[10px] bg-[#4F46E5] px-4 text-sm font-semibold text-white">Open Settlement &amp; Balances →</button>
      </section>
    </>
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
    <section className={`${card} flex flex-col gap-5 p-5`}>
      <div>
        <h2 className="m-0 text-lg font-bold">Monthly Spending Timeline ({years.join("–")})</h2>
        <div className="text-sm text-slate-500">Total research expenses per month, {monthLabel(months[0].key)} to {monthLabel(months[months.length - 1].key)}</div>
      </div>

      {/* Single-series bar chart: one hue, no legend; hover a bar for its values. Cards below double as the table view. */}
      <div className="overflow-x-auto">
        <div className="flex min-w-[560px] items-end gap-4 border-b border-[#CBD5E1] px-2 pt-8" style={{ height: 240 }} role="img"
          aria-label={`Monthly spending: ${months.map((m) => `${monthLabel(m.key)} ${taka(m.total)}`).join(", ")}`}>
          {months.map((m) => (
            <div key={m.key} className="relative flex h-full flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHover(m.key)} onMouseLeave={() => setHover(null)}>
              {hover === m.key && (
                <div className="pointer-events-none absolute z-10 -translate-y-2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow"
                  style={{ bottom: `${(m.total / max) * 100}%` }}>
                  <div className="font-semibold">{monthLabel(m.key)}</div>
                  <div className="font-mono">{taka(m.total)} · {m.count} logs</div>
                </div>
              )}
              <div className={`w-full max-w-[52px] rounded-t ${hover && hover !== m.key ? "bg-[#059669]/50" : "bg-[#059669]"}`}
                style={{ height: `${Math.max((m.total / max) * 100, 1.5)}%` }} />
            </div>
          ))}
        </div>
        <div className="flex min-w-[560px] gap-4 px-2 pt-2">
          {months.map((m) => <div key={m.key} className="flex-1 text-center text-[13px] font-medium text-slate-700">{monthLabel(m.key)}</div>)}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
        {months.map((m) => (
          <div key={m.key} className="rounded-xl border border-line bg-[#F8FAFC] p-3">
            <div className="text-[13px] text-slate-600">{monthLabel(m.key)}</div>
            <div className="money text-lg">{taka(m.total)}</div>
            <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{m.count} logs</span><span>Avg: {takaDec(Math.round(m.avg * 100) / 100)}</span></div>
          </div>
        ))}
      </div>
    </section>
  );
}
