"use client";

import { useMemo, useState, useTransition } from "react";
import { Shell, HeaderButton, useViewer } from "@/components/shell";
import { PencilIcon, PersonIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { Figure, Statement } from "@/components/balance-editor";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { ProfileModal } from "@/components/debtors/profile-modal";
import { RepayForm, repayTargets } from "@/components/debtors/repay-form";
import { Avatar, EmptyNote, Flash, SectionCard, StatusPill, td, th, totalRow } from "@/components/debtors/bits";
import { ErrorBox, Modal, btnDanger, btnGhost, btnPrimary } from "@/components/modal";
import { Spinner, UnderlineTabs, stagger } from "@/components/motion";
import { FlowChart, OwedRanking, type Flow } from "@/components/charts";
import { SortTh, useSort } from "@/components/sortable";
import { usePalettePeople } from "@/components/command-palette";
import { deletePerson, updatePerson } from "@/lib/actions";
import { amountSigned, buildProfiles, byOwesThenName, type EventKind, type Profile } from "@/lib/ledger";
import { dateLong, pct, taka } from "@/lib/format";
import type { FinanceData, Status } from "@/lib/types";
import Link from "next/link";
import { computeDashboard } from "@/lib/dashboard";
import { sumBy } from "@/lib/money";

type Tab = "portfolio" | "table" | "ledger";
type TypeF = "ALL" | "LENT" | "REPAID";
type StatusF = "All" | Status | "Late";
const STATUSES: StatusF[] = ["All", "Pending", "Partially Paid", "Repaid", "Late"];
const isLate = (p: Profile) => p.owes > 0 && p.dueKind === "late";
const matchStatus = (p: Profile, s: StatusF) => s === "All" || (s === "Late" ? isLate(p) : p.status === s);
const LEDGER_TYPE: Record<EventKind, { label: string; color: string }> = {
  "Took loan": { label: "Loan", color: "text-ink" },
  "Used my card": { label: "Card use", color: "text-ink" },
  "Paid back": { label: "Repayment", color: "text-brand-2" },
};
const textBtn = "min-h-8 rounded-md px-2 text-brand-2 hover:bg-soft disabled:text-slate-400";

type Dialog =
  | { kind: "new" }
  | { kind: "loan"; p: Profile }
  | { kind: "repay"; p: Profile }
  | { kind: "edit"; p: Profile }
  | { kind: "delete"; p: Profile }
  | null;

export function DebtorsView({ data, today }: { data: FinanceData; today: string }) {
  const viewer = useViewer();
  const [tab, setTab] = useState<Tab>("portfolio");
  const [statusF, setStatusF] = useState<StatusF>("All");
  const [typeF, setTypeF] = useState<TypeF>("ALL");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  const all = useMemo(() => buildProfiles(data, today).sort(byOwesThenName), [data, today]);
  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;
  const ql = q.trim().toLowerCase();

  const [sortBy, setSortBy] = useState<"owes" | "due" | "activity" | "name">("owes");
  const people = all.filter(
    (p) =>
      matchStatus(p, statusF) &&
      (!ql || `${p.name} ${p.reasons.join(" ")} ${p.notes ?? ""} ${p.relation ?? ""}`.toLowerCase().includes(ql))
  ).sort((a, b) =>
    sortBy === "due" ? (a.owes > 0 && a.due ? a.due : "9999").localeCompare(b.owes > 0 && b.due ? b.due : "9999") || b.owes - a.owes
    : sortBy === "activity" ? (b.lastIso ?? "").localeCompare(a.lastIso ?? "")
    : sortBy === "name" ? a.name.localeCompare(b.name)
    : b.owes - a.owes || a.name.localeCompare(b.name));
  const dash = useMemo(() => computeDashboard(data, today), [data, today]);

  const ledgerAll = all.flatMap((p) => p.events.map((e) => ({ ...e, person: p.name, personId: p.id })));
  const ledger = ledgerAll
    .filter((e) => typeF === "ALL" || (typeF === "REPAID" ? e.kind === "Paid back" : e.kind !== "Paid back"))
    .filter((e) => !ql || `${e.person} ${e.detail}`.toLowerCase().includes(ql))
    .sort((a, b) => b.iso.localeCompare(a.iso));

  const totLent = sumBy(all, (p) => p.taken);
  const totRepaid = sumBy(all, (p) => p.paid);
  const totOwes = sumBy(all, (p) => p.owes);
  const pTot = people.reduce(
    (s, p) => ({ lent: s.lent + p.taken, rep: s.rep + p.paid, left: s.left + p.owes, loans: s.loans + p.loanCount + p.cardCount }),
    { lent: 0, rep: 0, left: 0, loans: 0 }
  );

  const owingCount = all.filter((p) => p.owes > 0).length;
  const late = all.filter(isLate);
  const lateSum = late.reduce((s, p) => s + p.owes, 0);

  const flows = useMemo<Flow[]>(() => [
    ...data.loans.map((l) => ({ iso: l.taken_on, amount: l.amount, dir: "out" as const })),
    ...data.cardUses.filter((u) => u.person_id).map((u) => ({ iso: u.used_on, amount: u.amount, dir: "out" as const })),
    ...data.repayments.map((r) => ({ iso: r.paid_on, amount: r.amount, dir: "in" as const })),
  ], [data.loans, data.cardUses, data.repayments]);
  usePalettePeople(all, setOpenId);

  const summarySort = useSort(people, {
    name: (p) => p.name, records: (p) => p.loanCount + p.cardCount, taken: (p) => p.taken, paid: (p) => p.paid,
    owes: (p) => p.owes, due: (p) => (p.owes > 0 ? p.due : null), pct: (p) => pct(p.paid, p.taken, 1),
  });
  const ledgerSort = useSort(ledger, { date: (e) => e.iso, person: (e) => e.person, amount: (e) => e.amount, after: (e) => e.owesAfter });

  const tabs: [Tab, string, number | null][] = [
    ["portfolio", "People", null],
    ["table", "Summary", people.length],
    ["ledger", "History", ledgerAll.length],
  ];

  const pv = openId ? all.find((p) => p.id === openId) : undefined;
  const fresh = (p: Profile) => all.find((x) => x.id === p.id) ?? p;
  const knownNames = data.people.map((p) => p.name);
  const close = () => setDialog(null);
  const added = (personId: string | null, text: string) => { close(); setFlash(text); if (personId) setOpenId(personId); };

  return (
    <Shell
      subtitle="Everyone who owes you, across loans and card use, with every repayment."
      actions={
        <HeaderButton onClick={() => setDialog({ kind: "new" })}><PersonIcon size={15} />Add debtor</HeaderButton>
      }
    >
      <Statement label="Receivable figures" cols={4}>
        <Figure label="Lent out" value={totLent} note="Loans and card use by others" />
        <Figure label="Collected" value={totRepaid} tone="good" note={`${pct(totRepaid, totLent, 1)}% recovered`} />
        <Figure label="Outstanding" value={totOwes} tone="owed" note={`${owingCount} ${owingCount === 1 ? "person" : "people"} still owe`} />
        <Figure label="Overdue" value={dash.overdue.amount} tone={dash.overdue.amount ? "owed" : "muted"}
          note={`${dash.dueWeek.count ? `${taka(dash.dueWeek.amount)} due in 7 days` : "Nothing due in 7 days"}`} />
      </Statement>

      {late.length > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-bad-line bg-gradient-to-r from-bad-tint to-bad-tint px-4 py-3">
          <span aria-hidden="true" className="relative grid size-9 flex-none place-items-center rounded-full bg-bad-solid text-[15px] font-semibold text-white">
            !
            <span className="absolute inset-0 animate-ping rounded-full bg-bad-solid opacity-25 [animation-iteration-count:3]" />
          </span>
          <div className="min-w-0 flex-auto">
            <div className="text-[14px] font-medium text-bad-deep">
              {late.length} {late.length === 1 ? "person is" : "people are"} past their pay-back date
            </div>
            <div className="text-[13px] text-bad/80">{taka(lateSum)} overdue · {late.slice(0, 3).map((p) => p.first).join(", ")}{late.length > 3 ? ` and ${late.length - 3} more` : ""}</div>
          </div>
          <div className="flex -space-x-2">
            {late.slice(0, 4).map((p) => (
              <button key={p.id} type="button" onClick={() => setOpenId(p.id)} aria-label={`Open ${p.name}`} title={p.name}
                className="rounded-full transition-[translate] hover:z-10 hover:-translate-y-0.5"><Avatar text={p.initials} size={30} /></button>
            ))}
          </div>
          <button type="button" onClick={() => { setTab("portfolio"); setStatusF("Late"); }}
            className="min-h-9 rounded-lg border border-bad-line bg-surface px-3 text-[13.5px] font-medium text-bad-deep hover:border-bad hover:bg-bad-tint">
            Show late
          </button>
        </div>
      )}

      <div className="grid items-stretch gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <FlowChart title="Money out vs paid back" sub="Loans and card use by others, against repayments, per month."
          flows={flows} today={today} outLabel="Lent & card use" inLabel="Paid back" />
        <OwedRanking items={all} onOpen={setOpenId} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line">
          <UnderlineTabs label="Views" tabs={tabs} value={tab} onChange={setTab} />
          <label className="mb-2 flex min-h-9 w-full items-center gap-2 sm:w-auto sm:min-w-[200px] sm:flex-[0_1_280px] rounded-lg border border-line-strong bg-surface px-2.5 focus-within:border-brand-2">
            <SearchIcon size={15} className="text-slate-500" />
            <span className="sr-only">Search</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, reason, notes" className="min-w-0 flex-auto bg-transparent text-[14px] outline-none" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
          {tab === "portfolio" && (
            <label className="flex items-center gap-1.5 text-slate-500">Sort
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="min-h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink">
                <option value="owes">Outstanding (highest)</option><option value="due">Due date (soonest)</option>
                <option value="activity">Recent activity</option><option value="name">Name</option>
              </select>
            </label>
          )}
          {tab !== "ledger" ? (
            <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-1">
              <span className="mr-1.5 text-slate-500">Status</span>
              {STATUSES.map((s) => {
                const n = all.filter((p) => matchStatus(p, s)).length;
                if (s === "Late" && !n) return null;
                return (
                  <button key={s} type="button" aria-pressed={statusF === s} onClick={() => setStatusF(s)}
                    className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 ${statusF === s ? "border-ink bg-ink text-on-ink shadow-[0_2px_6px_-2px_rgba(28,27,24,0.4)]" : s === "Late" ? "border-bad-line bg-bad-tint text-bad hover:border-bad" : "border-line bg-surface text-slate-600 hover:border-line-strong hover:text-ink"}`}>
                    {s}<span className={`text-[11.5px] tabular-nums ${statusF === s ? "text-on-ink/70" : "text-slate-400"}`}>{n}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div role="group" aria-label="Filter ledger by type" className="flex flex-wrap items-center gap-1">
              <span className="mr-1.5 text-slate-500">Show</span>
              {([["ALL", "Everything"], ["LENT", "Money out"], ["REPAID", "Repayments"]] as [TypeF, string][]).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={typeF === key} onClick={() => setTypeF(key)}
                  className={`min-h-8 rounded-full border px-3 ${typeF === key ? "border-ink bg-ink text-on-ink shadow-[0_2px_6px_-2px_rgba(28,27,24,0.4)]" : "border-line bg-surface text-slate-600 hover:border-line-strong hover:text-ink"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Flash text={flash} />

      {tab === "portfolio" && (
        <section key={statusF} aria-label="People" className="flex animate-fade-in flex-col gap-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] items-start gap-3">
            {people.map((p, i) => {
              const isOpen = expanded === p.id;
              const records = [p.loanCount && `${p.loanCount} ${p.loanCount === 1 ? "loan" : "loans"}`, p.cardCount && `${p.cardCount} card ${p.cardCount === 1 ? "use" : "uses"}`].filter(Boolean).join(", ") || "No records";
              return (
                <article key={p.id} style={stagger(i)} className="lift spot flex animate-fade-up flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
                  <div className="flex items-start gap-3">
                    <Avatar text={p.initials} size={38} />
                    <div className="min-w-0 flex-auto">
                      <button type="button" onClick={() => setOpenId(p.id)} className="min-h-7 text-left text-[15px] font-medium decoration-slate-400 underline-offset-4 hover:text-brand-ink hover:underline">{p.name}</button>
                      <div className="text-[12.5px] text-slate-500">{records}{p.owes > 0 && <> · due {dateLong(p.due)}</>}</div>
                    </div>
                    <StatusPill status={p.status} />
                  </div>
                  {p.reasons.length > 0 && <p className="m-0 line-clamp-2 text-[13px] text-slate-600">{p.reasons.join(", ")}</p>}
                  <dl className="m-0 grid grid-cols-3 gap-2 border-t border-soft pt-3 text-[12px]">
                    <div><dt className="text-slate-500">Borrowed</dt><dd className="money m-0 text-[14px]">{taka(p.taken)}</dd></div>
                    <div><dt className="text-slate-500">Repaid</dt><dd className="money m-0 text-[14px]">{taka(p.paid)}</dd></div>
                    <div><dt className="text-slate-500">Left</dt><dd className="money m-0 text-[14px] text-owed">{taka(p.owes)}</dd></div>
                  </dl>
                  <div className="flex items-center gap-2.5 text-[12px] text-slate-500">
                    <div className="h-1.5 flex-auto overflow-hidden rounded-full bg-line"><div className="bar-fill h-full rounded-full bg-brand-2" style={{ width: `${Math.min(p.pct, 100)}%`, ...stagger(i, 40, 600) }} /></div>
                    <span className="money w-9 text-right">{pct(p.paid, p.taken, 1).toFixed(0)}%</span>
                  </div>
                  {isOpen && (
                    <ol className="m-0 flex max-h-[320px] animate-fade-up list-none flex-col divide-y divide-soft overflow-y-auto rounded-lg border border-soft bg-subtle p-0">
                      {p.events.map((e) => (
                        <li key={e.id} className="flex items-baseline gap-3 px-3 py-2 text-[13px]">
                          <div className="min-w-0 flex-auto">
                            <div>{e.kind === "Paid back" ? "Paid back" : e.kind === "Took loan" ? "Borrowed" : "Used my card"}</div>
                            <div className="text-[12px] text-slate-500">{dateLong(e.iso)} · {e.detail}</div>
                          </div>
                          <div className="text-right">
                            <div className={`money ${LEDGER_TYPE[e.kind].color}`}>{amountSigned(e.sign, e.amount)}</div>
                            <div className="text-[11.5px] text-slate-500">left {taka(e.owesAfter)}</div>
                          </div>
                        </li>
                      ))}
                      {p.events.length === 0 && <li className="px-3 py-2 text-[13px] text-slate-500">No records yet.</li>}
                    </ol>
                  )}
                  <div className="-mx-1 flex flex-wrap items-center gap-1 border-t border-soft pt-2 text-[13px]">
                    {!viewer && <button type="button" onClick={() => setDialog({ kind: "loan", p })} className={textBtn}>Add loan</button>}
                    {!viewer && <button type="button" onClick={() => setDialog({ kind: "repay", p })} disabled={p.owes <= 0} className={textBtn}>Record repayment</button>}
                    <button type="button" onClick={() => setExpanded(isOpen ? null : p.id)} aria-expanded={isOpen} className={textBtn}>{isOpen ? "Hide history" : "History"}</button>
                    <Link href={`/debtors/${p.id}`} className={`${textBtn} inline-flex items-center`}>Profile</Link>
                    {!viewer && (
                      <span className="ml-auto flex">
                        <IconBtn label="Edit debtor" onClick={() => setDialog({ kind: "edit", p })}><PencilIcon size={15} /></IconBtn>
                        <IconBtn label="Delete debtor" muted onClick={() => setDialog({ kind: "delete", p })}><TrashIcon size={15} /></IconBtn>
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {people.length === 0 && <EmptyNote>{all.length ? "Nobody matches this filter." : viewer ? "No debtors yet." : "No debtors yet. Use “Add debtor” to record the first one."}</EmptyNote>}
        </section>
      )}

      {tab === "table" && (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="stack-table w-full min-w-[1000px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-line bg-subtle text-left">
                  <SortTh k="name" label="Person" sort={summarySort.sort} onSort={summarySort.toggle} text />
                  <SortTh k="records" label="Records" sort={summarySort.sort} onSort={summarySort.toggle} right />
                  <SortTh k="taken" label="Borrowed" sort={summarySort.sort} onSort={summarySort.toggle} right />
                  <SortTh k="paid" label="Repaid" sort={summarySort.sort} onSort={summarySort.toggle} right />
                  <SortTh k="owes" label="Left" sort={summarySort.sort} onSort={summarySort.toggle} right />
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Reasons</th>
                  <SortTh k="due" label="Next due" sort={summarySort.sort} onSort={summarySort.toggle} text />
                  <SortTh k="pct" label="Repaid %" sort={summarySort.sort} onSort={summarySort.toggle} right />
                  {!viewer && <th scope="col" className={th}><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {summarySort.sorted.map((p) => (
                  <tr key={p.id} className="border-b border-soft">
                    <th scope="row" className={`${td} text-left font-medium`}>
                      <button type="button" onClick={() => setOpenId(p.id)} className="text-left decoration-slate-400 underline-offset-4 hover:underline">{p.name}</button>
                    </th>
                    <td data-label="Records" className={`${td} money text-right text-slate-600`}>{p.loanCount + p.cardCount}</td>
                    <td data-label="Borrowed" className={`${td} money text-right`}>{taka(p.taken)}</td>
                    <td data-label="Repaid" className={`${td} money text-right`}>{taka(p.paid)}</td>
                    <td data-label="Left" className={`${td} money text-right text-owed`}>{taka(p.owes)}</td>
                    <td data-label="Status" className={td}><StatusPill status={p.status} /></td>
                    <td data-label="Reasons" className={`${td} max-w-[260px] truncate text-slate-600`} title={p.reasons.join(", ")}>{p.reasons.join(", ")}</td>
                    <td data-label="Next due" className={`${td} whitespace-nowrap`}>{p.owes > 0 ? dateLong(p.due) : "—"}</td>
                    <td data-label="Repaid %" className={`${td} money text-right text-slate-600`}>{pct(p.paid, p.taken, 1).toFixed(1)}%</td>
                    {!viewer && <td data-label="" className="whitespace-nowrap px-3 py-1.5 text-right text-[13px]">
                      <button type="button" onClick={() => setDialog({ kind: "loan", p })} className={textBtn}>Loan</button>
                      <button type="button" onClick={() => setDialog({ kind: "repay", p })} disabled={p.owes <= 0} className={textBtn}>Repay</button>
                    </td>}
                  </tr>
                ))}
                <tr className={totalRow}>
                  <th scope="row" className={`${td} text-left`}>Total</th>
                  <td data-label="Records" className={`${td} money text-right`}>{pTot.loans}</td>
                  <td data-label="Borrowed" className={`${td} money text-right`}>{taka(pTot.lent)}</td>
                  <td data-label="Repaid" className={`${td} money text-right`}>{taka(pTot.rep)}</td>
                  <td data-label="Left" className={`${td} money text-right text-owed`}>{taka(pTot.left)}</td>
                  <td className={td} colSpan={3} />
                  <td data-label="Repaid %" className={`${td} money text-right`}>{pct(pTot.rep, pTot.lent, 1).toFixed(1)}%</td>
                  {!viewer && <td className={td} />}
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === "ledger" && (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="stack-table w-full min-w-[820px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-line bg-subtle text-left">
                  <SortTh k="date" label="Date" sort={ledgerSort.sort} onSort={ledgerSort.toggle} />
                  <SortTh k="person" label="Person" sort={ledgerSort.sort} onSort={ledgerSort.toggle} text />
                  <th scope="col" className={th}>Type</th>
                  <th scope="col" className={th}>Reason / method</th>
                  <SortTh k="amount" label="Amount" sort={ledgerSort.sort} onSort={ledgerSort.toggle} right />
                  <SortTh k="after" label="Owes after" sort={ledgerSort.sort} onSort={ledgerSort.toggle} right />
                </tr>
              </thead>
              <tbody>
                {ledgerSort.sorted.map((e) => {
                  const t = LEDGER_TYPE[e.kind];
                  return (
                    <tr key={e.id} className="border-b border-soft">
                      <td data-label="Date" className={`${td} whitespace-nowrap text-slate-600`}>{dateLong(e.iso)}</td>
                      <td className={`${td} font-medium`}>
                        <button type="button" onClick={() => setOpenId(e.personId)} className="text-left decoration-slate-400 underline-offset-4 hover:underline">{e.person}</button>
                      </td>
                      <td data-label="Type" className={`${td} whitespace-nowrap text-slate-600`}>{t.label}</td>
                      <td data-label="Reason / method" className={`${td} text-slate-600`}>{e.detail}</td>
                      <td data-label="Amount" className={`${td} money text-right ${t.color}`}>{amountSigned(e.sign, e.amount)}</td>
                      <td data-label="Owes after" className={`${td} money text-right text-slate-600`}>{taka(e.owesAfter)}</td>
                    </tr>
                  );
                })}
                {ledger.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Nothing matches.</td></tr>}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {dialog?.kind === "new" && (
        <AddDebtorDialog mode="loan" extended title="Add debtor" submitLabel="Add debtor" account={account} knownNames={knownNames} onClose={close} onAdded={added} />
      )}
      {dialog?.kind === "loan" && (
        <AddDebtorDialog mode="loan" extended title="Add another loan" submitLabel="Add loan" account={account} knownNames={knownNames}
          lockedPerson={{ name: dialog.p.name, initials: dialog.p.initials, owes: fresh(dialog.p).owes }} onClose={close} onAdded={added} />
      )}
      {dialog?.kind === "repay" && (
        <Modal title="Record repayment" onClose={close} maxWidth={620}>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-2.5 rounded-md border border-good-line bg-good-tint px-3.5 py-2.5">
              <Avatar text={dialog.p.initials} size={32} />
              <div><div className="font-semibold">{dialog.p.name}</div><div className="text-[13px] text-slate-600">Currently owes {taka(fresh(dialog.p).owes)}</div></div>
            </div>
            {fresh(dialog.p).owes > 0 ? (
              <RepayForm key={fresh(dialog.p).owes} personId={dialog.p.id} first={dialog.p.first} targets={repayTargets(fresh(dialog.p), data.cards)}
                mode="all" account={account} withDate onSaved={(text) => { close(); setFlash(text); }} />
            ) : (
              <div className="text-sm text-slate-600">{dialog.p.first} has paid everything back.</div>
            )}
          </div>
        </Modal>
      )}
      {dialog?.kind === "edit" && <EditPersonDialog p={dialog.p} onClose={close} />}
      {dialog?.kind === "delete" && <DeletePersonDialog p={dialog.p} onClose={close} onDone={(t) => { close(); setFlash(t); }} />}

      {pv && (
        <ProfileModal
          profile={pv}
          variant="all"
          cards={data.cards}
          account={account}
          onClose={() => setOpenId(null)}
          onMore={() => { setOpenId(null); setDialog({ kind: "loan", p: pv }); }}
          onSaved={setFlash}
        />
      )}
    </Shell>
  );
}

function IconBtn({ label, onClick, muted = false, children }: { label: string; onClick: () => void; muted?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-md hover:bg-soft ${muted ? "text-slate-400 hover:text-bad" : "text-slate-500 hover:text-ink"}`}>
      {children}
    </button>
  );
}

function EditPersonDialog({ p, onClose }: { p: Profile; onClose: () => void }) {
  const [f, setF] = useState({ name: p.name, relation: p.relation ?? "", phone: p.phone ?? "", notes: p.notes ?? "" });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setError(""); };

  return (
    <Modal title={`Edit ${p.name}`} onClose={onClose} maxWidth={520}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={pending} className={btnPrimary}
          onClick={() => start(async () => { const r = await updatePerson(p.id, f); if (r.error) setError(r.error); else onClose(); })}>
          {pending && <Spinner />}{pending ? "Saving…" : "Save"}
        </button>
      </>}>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <label className="field-label sm:col-span-2">Name *<input className="field-input" value={f.name} onChange={set("name")} /></label>
        <label className="field-label">Relation<input className="field-input" value={f.relation} onChange={set("relation")} placeholder="e.g. Friend, sister" /></label>
        <label className="field-label">Phone<input className="field-input" value={f.phone} onChange={set("phone")} inputMode="tel" /></label>
        <label className="field-label sm:col-span-2">Notes<input className="field-input" value={f.notes} onChange={set("notes")} /></label>
        {error && <ErrorBox className="sm:col-span-2">{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

function DeletePersonDialog({ p, onClose, onDone }: { p: Profile; onClose: () => void; onDone: (t: string) => void }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const hasRecords = p.txCount > 0;

  return (
    <Modal title={`Delete ${p.name}?`} onClose={onClose} maxWidth={480}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>{hasRecords ? "Close" : "Cancel"}</button>
        {!hasRecords && (
          <button type="button" disabled={pending} className={btnDanger}
            onClick={() => start(async () => { const r = await deletePerson(p.id); if (r.error) setError(r.error); else onDone(`${p.name} was deleted.`); })}>
            {pending && <Spinner />}{pending ? "Deleting…" : "Delete"}
          </button>
        )}
      </>}>
      <div className="flex flex-col gap-3 p-5 text-[15px]">
        {hasRecords ? (
          <p className="m-0">{p.name} has {p.txCount} records (loans, card uses or repayments). To keep your history correct, people with records can&apos;t be deleted.</p>
        ) : (
          <p className="m-0">{p.name} has no records. This permanently removes them from your list.</p>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}
