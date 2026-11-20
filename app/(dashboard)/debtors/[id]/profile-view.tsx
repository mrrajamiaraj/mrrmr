"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell, useViewer } from "@/components/shell";
import { Avatar, Flash, SectionCard, SectionHead, StatusPill } from "@/components/debtors/bits";
import { repayTargets } from "@/components/debtors/repay-form";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { CardPurchaseDialog } from "@/components/card-purchase-dialog";
import { OneSchedule } from "@/components/debtors/emi-schedule";
import { EditPersonDialog, ExportPdfDialog, RepayDialog } from "@/components/debtors/person-dialogs";
import { DeleteDialog } from "@/components/delete-dialog";
import { DateChip, Ring, TrendArea } from "@/components/viz";
import { Donut, FlowChart, Mark, type FlowLabels } from "@/components/research-viz";
import { CountUp, stagger } from "@/components/motion";
import { Badge, Button, buttonClass, EmptyState, IconButton, Menu, Money } from "@/components/ui";
import { ChevronDown, ChevronLeft, DownloadIcon, DueIcon, FileIcon, MoreIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, CardIcon, TrendIcon } from "@/components/icons";
import { buildProfiles, cardLabel, cardPlanStatus, type PlanStatus } from "@/lib/ledger";
import { computeDashboard } from "@/lib/dashboard";
import { buildStatement, type StatementRow } from "@/lib/statement";
import { personMonths } from "@/lib/people-stats";
import { personItems, type DeleteItem } from "@/lib/deletion";
import { dateLong, monthLabel, taka } from "@/lib/format";
import type { FinanceData } from "@/lib/types";

type Show = "all" | "out" | "in";
type Deleting = { items: DeleteItem[]; title: string; whole: boolean };

/**
 * One person: totals, what's due next, and the full history with a running balance. Every figure comes from
 * lib/ledger, lib/dashboard and lib/statement — the same tested rules as every other page — and only this
 * person's records are read. Actions: record a repayment, add a loan or card purchase, export a PDF statement, and
 * (in the Actions menu) edit details or delete history.
 */
export function DebtorProfileView({ data, personId, today }: { data: FinanceData; personId: string; today: string }) {
  const viewer = useViewer();
  const router = useRouter();
  const p = useMemo(() => buildProfiles(data, today).find((x) => x.id === personId), [data, today, personId]);
  const d = useMemo(() => computeDashboard(data, today), [data, today]);
  const person = data.people.find((x) => x.id === personId);
  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;

  const [flash, setFlash] = useState("");
  const [dialog, setDialog] = useState<"loan" | "card" | "repay" | "edit" | "pdf" | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [show, setShow] = useState<Show>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const statement = useMemo(() => buildStatement(data, personId, today, { from: from || null, to: to || null }), [data, personId, today, from, to]);
  // Month chart: always the full history (a date filter narrows the table, not the chart).
  const months = useMemo(() => {
    const s = buildStatement(data, personId, today, { from: null, to: null });
    return s ? personMonths(s.rows) : [];
  }, [data, personId, today]);
  const plans = useMemo(() => {
    const m = new Map<string, PlanStatus>();
    for (const c of data.cards) for (const [k, v] of cardPlanStatus(data, c.id)) if (v.personId === personId) m.set(k, v);
    return m;
  }, [data, personId]);
  const all = useMemo(() => personItems(data, personId), [data, personId]);

  // Removed (e.g. just now, from the Actions menu) or a stale link.
  if (!p || !person || !statement) {
    return (
      <Shell subtitle="This person isn't in your list.">
        <EmptyState title="Person not found" action={<Link href="/debtors" className={buttonClass("secondary")}>Back to People</Link>}>
          They may have been removed.
        </EmptyState>
      </Shell>
    );
  }

  const rows = statement.rows.filter((r) => show === "all" || (show === "in" ? r.repaid != null : r.borrowed != null)).slice().reverse();
  const dues = d.open.filter((o) => o.personId === personId);
  const targets = repayTargets(p, data.cards);
  const filtered = !!(from || to);

  const cardName = (id: string | null) => cardLabel(data.cards.find((c) => c.id === id));
  const askDelete = (r: StatementRow) => setDeleting({ items: [{ kind: r.kind, id: r.id }], title: `Delete this ${r.type.toLowerCase()}?`, whole: false });

  const ql = q.trim().toLowerCase();
  const shownRows = ql ? rows.filter((r) => `${r.type} ${r.description} ${r.method ?? ""} ${dateLong(r.iso)} ${r.borrowed ?? ""} ${r.repaid ?? ""}`.toLowerCase().includes(ql)) : rows;
  const maxBal = Math.max(1, ...statement.rows.map((r) => Math.abs(r.balance)));
  const balancePoints = months.map((m) => ({ key: m.key, label: monthLabel(m.key), short: monthLabel(m.key).split(" ")[0], value: Math.max(m.running, 0) }));
  const sources = [
    ...(p.loanTotal > 0 ? [{ name: "Bank loans", value: p.loanOut, color: "var(--color-owed-bar)", sub: `${taka(p.loanTotal)} lent · ${taka(p.paidLoan)} repaid` }] : []),
    ...data.cards.filter((c) => data.cardUses.some((u) => u.person_id === personId && u.card_id === c.id))
      .map((c, i) => ({ name: cardLabel(c), value: p.cardOutByCard[c.id] ?? 0, color: i ? "#2F5583" : "#B98E81", sub: "their purchases on your card" })),
  ];
  const maxDue = Math.max(1, ...dues.map((o) => o.left));
  const pickMonth = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    setFrom(`${key}-01`); setTo(`${key}-${String(last).padStart(2, "0")}`); setShow("all");
    document.getElementById("hist-h")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const late = p.dueKind === "late" && p.owes > 0;

  return (
    <Shell subtitle="" hero={
      <header className="flex flex-col gap-5">
        <Link href="/debtors" className="group inline-flex min-h-8 w-fit items-center gap-1 rounded-md text-[13px] text-slate-500 hover:text-ink"><ChevronLeft size={15} className="transition-transform group-hover:-translate-x-0.5" />People &amp; loans</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span title={`${p.pct}% repaid`} className="animate-pop-in"><Ring pct={p.taken ? p.pct : 0} size={72} stroke={4} color={late ? "var(--color-bad)" : "var(--color-brand-2)"}><Avatar text={p.initials} size={56} /></Ring></span>
            <div className="min-w-0">
              <h1 className="m-0 break-words font-display text-title font-normal">{p.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
                <StatusPill status={p.status} />
                {late && <Badge tone="bad"><DueIcon size={12} />Overdue</Badge>}
                <span>{[person.relation, person.phone].filter(Boolean).join(" · ") || "No contact details"}</span>
              </div>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {!viewer && p.owes > 0 && <Button onClick={() => setDialog("repay")} className="flex-auto sm:flex-none"><TrendIcon size={15} />Record repayment</Button>}
            {!viewer && (
              <Menu label="Add for this person" align="end" triggerClass={buttonClass("secondary", "md", "flex-auto sm:flex-none")}
                trigger={<><PlusIcon size={15} />Add<ChevronDown size={14} /></>}
                items={[
                  { label: "Loan", icon: <PlusIcon size={16} />, onSelect: () => setDialog("loan") },
                  ...(data.cards.length ? [{ label: "Card purchase", icon: <CardIcon size={16} />, onSelect: () => setDialog("card") }] : []),
                ]} />
            )}
            {!viewer && <Button variant="secondary" onClick={() => setDialog("pdf")} className="flex-auto sm:flex-none"><FileIcon size={15} />Export PDF</Button>}
            {!viewer && (
              <Menu label="Actions" align="end" trigger={<><MoreIcon size={18} /><span className="text-[14px] font-medium">Actions</span></>}
                triggerClass={buttonClass("ghost", "md", "border border-line")}
                items={[
                  { label: "Edit details", icon: <PencilIcon size={16} />, onSelect: () => setDialog("edit") },
                  { kind: "link", label: "Export CSV", icon: <DownloadIcon size={16} />, href: `/export?type=debtor&id=${personId}`, download: true },
                  { kind: "separator" },
                  { label: all.length ? "Delete data…" : `Remove ${p.first}…`, icon: <TrashIcon size={16} />, danger: true,
                    onSelect: () => setDeleting({ items: all, title: all.length ? `Delete ${p.first}'s data?` : `Remove ${p.name}?`, whole: true }) },
                ]} />
            )}
          </div>
        </div>

        <section aria-label={`${p.name} at a glance`} className="deck grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/60">{p.owes ? "Owes you now" : "Balance"}</span>
              <span className={`money text-[clamp(36px,5.5vw,56px)] font-medium leading-none tracking-[-0.03em] ${late ? "text-[#FFA08F]" : p.owes ? "text-[#F0C77E]" : "text-[#7DD4B8]"}`}>
                <CountUp value={p.owes} format={taka} duration={1400} intro />
              </span>
              <span className="text-[12.5px] text-white/55">{p.owes ? `${p.pct}% of ${taka(p.taken)} paid back` : p.taken ? "Everything is paid back" : "Nothing borrowed yet"}</span>
              {p.taken > 0 && (
                <span aria-hidden="true" className="mt-2 flex h-2.5 max-w-[420px] gap-[2px] overflow-hidden rounded-full bg-white/10">
                  <span className="bar-fill h-full rounded-l-full bg-gradient-to-r from-[#3DAA80] to-[#7DD4B8]" style={{ width: `${Math.min(p.pct, 100)}%` }} />
                  {p.owes > 0 && <span className="bar-fill h-full rounded-r-full" style={{ width: `${100 - Math.min(p.pct, 100)}%`, background: late ? "#FFA08F" : "#E8C27A", animationDelay: "150ms" }} />}
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="deck-tile flex flex-col gap-1 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">Borrowed</span>
                <span className="money text-[20px] leading-tight text-white"><CountUp value={p.taken} format={taka} duration={1300} intro /></span>
                <span className="text-[12px] text-white/55">{p.loanCount} {p.loanCount === 1 ? "loan" : "loans"} · {p.cardCount} card</span>
              </div>
              <div className="deck-tile flex flex-col gap-1 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">Repaid</span>
                <span className="money text-[20px] leading-tight text-[#7DD4B8]"><CountUp value={p.paid} format={taka} duration={1300} intro /></span>
                <span className="text-[12px] text-white/55">{p.payCount} {p.payCount === 1 ? "payment" : "payments"}</span>
              </div>
              <div className="deck-tile flex flex-col gap-1 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">Next due</span>
                <span className={`text-[17px] font-medium leading-tight ${late ? "text-[#FFA08F]" : "text-white"}`}>{p.owes > 0 && p.due ? dateLong(p.due) : "—"}</span>
                <span className="text-[12px] text-white/55">{p.owes <= 0 ? "Nothing owed" : !p.due ? "No due date set" : late ? "Overdue" : p.dueKind === "soon" ? "Within 7 days" : "Upcoming"}</span>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col justify-center">
            {balancePoints.length > 1
              ? <TrendArea dark color={late ? "#FFA08F" : "#E8C27A"} title="What they owed at each month end" points={balancePoints} />
              : <p className="m-0 text-[13px] text-white/55">A balance chart appears once there are entries in more than one month.</p>}
          </div>
        </section>
      </header>
    }>
      <Flash text={flash} />

      {months.length > 0 && (
        <SectionCard labelledBy="mon-h">
          <SectionHead id="mon-h" title="Month by month" sub="Borrowed and repaid in each month, with what they owed at the month's end. Click a month to show only its entries below." />
          <div className="border-t border-line px-4 py-4 sm:px-5">
            <FlowChart months={months} onSelect={pickMonth} selected={from && from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : undefined} labels={PERSON_LABELS} />
          </div>
        </SectionCard>
      )}

      {(dues.length > 0 || p.owes > 0) && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <SectionCard labelledBy="due-h">
            <SectionHead id="due-h" title="Coming up" sub="What's still to pay, earliest first. A repayment clears the earliest item first." />
            {dues.length ? (
              <ol className="relative m-0 list-none border-t border-line px-4 py-2 sm:px-5">
                <span aria-hidden="true" className="absolute bottom-5 left-[39px] top-5 w-px bg-gradient-to-b from-line-strong via-line to-transparent sm:left-[43px]" />
                {dues.slice(0, 8).map((o, i) => (
                  <li key={o.key} style={stagger(i, 60)} className="relative flex animate-fade-up items-center gap-3 py-2">
                    <span className="relative z-10 rounded-xl bg-surface"><DateChip iso={o.iso} today={today} size="sm" /></span>
                    <span className="min-w-0 flex-auto">
                      <span className="flex items-baseline justify-between gap-3 text-[13.5px]">
                        <span className={`truncate font-medium ${o.status === "overdue" ? "text-bad" : ""}`}>{o.source === "loan" ? "Bank loan" : cardName(o.cardId)}{o.emi ? " · EMI" : ""}</span>
                        <Money value={o.left} tone={o.status === "overdue" ? "bad" : "owed"} />
                      </span>
                      <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-soft">
                        <span className={`bar-fill block h-full rounded-full ${o.status === "overdue" ? "bg-bad/80" : "bg-owed-bar"}`} style={{ width: `${(o.left / maxDue) * 100}%`, animationDelay: `${i * 60 + 150}ms` }} />
                      </span>
                    </span>
                  </li>
                ))}
                {dues.length > 8 && <li className="py-2 pl-14 text-[12.5px] text-slate-500">+ {dues.length - 8} later</li>}
              </ol>
            ) : <div className="border-t border-line p-4"><EmptyState compact title="No due dates">What they owe has no due dates set.</EmptyState></div>}
          </SectionCard>
          <SectionCard labelledBy="src-h">
            <SectionHead id="src-h" title="Where it's owed" sub="Bank loans and each card are kept apart. A repayment goes to the one you choose." />
            <div className="border-t border-line px-4 py-4 sm:px-5">
              {sources.some((s) => s.value > 0)
                ? <Donut title="What they owe, by source" centerLabel="Owes" slices={sources} size={170} />
                : <EmptyState compact title="Nothing owed">Every source is paid back.</EmptyState>}
            </div>
          </SectionCard>
        </div>
      )}

      <SectionCard labelledBy="hist-h">
        <SectionHead id="hist-h" title="History" sub="Every entry in date order (newest first) with what they owe after it."
          action={
            <div role="group" aria-label="Show" className="flex gap-1">
              {([["all", "All"], ["out", "Borrowing"], ["in", "Repayments"]] as [Show, string][]).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}
                  className={`min-h-9 rounded-full border px-3 text-[13px] font-medium ${show === k ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-slate-600 hover:text-ink"}`}>{l}</button>
              ))}
            </div>
          } />
        <div className="flex flex-wrap items-end gap-3 border-t border-line px-4 py-3 sm:px-5">
          <label className="flex min-h-10 min-w-0 flex-[1_1_200px] items-center gap-2 self-end rounded-lg border border-line-strong bg-surface px-3 focus-within:border-brand-2">
            <SearchIcon size={15} className="text-slate-500" /><span className="sr-only">Search history</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reason, method, amount" className="min-w-0 flex-auto bg-transparent text-[14px] outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium text-slate-600">From
            <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className="min-h-10 rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium text-slate-600">To
            <input type="date" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} className="min-h-10 rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink" />
          </label>
          {filtered && <Button variant="quiet" size="sm" onClick={() => { setFrom(""); setTo(""); }}>Clear dates</Button>}
          <span role="status" className="ml-auto text-[12.5px] text-slate-500">{shownRows.length} {shownRows.length === 1 ? "entry" : "entries"}{filtered ? " in range" : ""}{ql ? " matching" : ""}</span>
        </div>

        <div className="overflow-x-auto border-t border-line">
          <table className="stack-table w-full min-w-[760px] border-collapse text-[14px]">
            <thead>
              <tr className="bg-subtle text-left">
                <th scope="col" className={TH}>Date</th>
                <th scope="col" className={TH}>Entry</th>
                <th scope="col" className={TH}>Method</th>
                <th scope="col" className={`${TH} text-right`}>Borrowed</th>
                <th scope="col" className={`${TH} text-right`}>Repaid</th>
                <th scope="col" className={`${TH} text-right`}>Balance</th>
                <th scope="col" className="w-12"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody key={`${show}|${from}|${to}|${ql}`}>
              {filtered && to && (
                <tr className="border-b border-soft bg-subtle/60"><td className={`${TD} text-slate-500`} colSpan={5}>Balance at {dateLong(to)}</td><td data-label="Balance" className={`${TD} money text-right`}>{bal(statement.closing)}</td><td /></tr>
              )}
              {shownRows.map((r, k) => {
                const plan = r.kind === "card_use" ? plans.get(r.id) : undefined;
                const expandable = !!plan && plan.of > 0;
                const isOpen = open === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr style={stagger(k, 25, 450)} className="animate-fade-up border-b border-soft align-top">
                      <td className={`${TD} whitespace-nowrap text-slate-600`}>{dateLong(r.iso)}</td>
                      <td data-label="Entry" className={TD}>
                        <span className="flex flex-col items-end gap-0.5 text-right sm:items-start sm:text-left">
                          <span className="flex flex-wrap items-center gap-1.5 font-medium">
                            <Badge tone={r.repaid != null ? "good" : r.kind === "loan" ? "neutral" : "info"} className="text-[11px]">{r.type}</Badge>
                            {plan?.plan === "emi" && <Badge tone="info" className="text-[11px]">EMI {plan.paidCount}/{plan.of}</Badge>}
                          </span>
                          <span className="text-[13px] text-slate-600"><Mark text={r.description} q={q} /></span>
                          {expandable && (
                            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}
                              className="inline-flex min-h-8 items-center gap-1 rounded-md text-[12.5px] font-medium text-brand-2 hover:underline">
                              <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />{isOpen ? "Hide" : plan!.plan === "emi" ? "EMI schedule" : "Payment detail"}
                            </button>
                          )}
                        </span>
                      </td>
                      <td data-label="Method" className={`${TD} text-slate-600`}>{r.method ?? <span className="text-slate-400">—</span>}</td>
                      <td data-label="Borrowed" className={`${TD} money text-right`}>{r.borrowed != null ? taka(r.borrowed) : <span className="text-slate-400 max-sm:hidden">—</span>}</td>
                      <td data-label="Repaid" className={`${TD} money text-right text-brand-2`}>{r.repaid != null ? taka(r.repaid) : <span className="text-slate-400 max-sm:hidden">—</span>}</td>
                      <td data-label="Balance" className={`${TD} text-right`}>
                        <span className="inline-flex flex-col items-end gap-1">
                          <span className="money">{bal(r.balance)}</span>
                          <span aria-hidden="true" className="block h-1 w-16 overflow-hidden rounded-full bg-soft max-sm:hidden">
                            <span className={`bar-fill ml-auto block h-full rounded-full ${r.balance < 0 ? "bg-brand-2" : "bg-owed-bar"}`} style={{ width: `${Math.max((Math.abs(r.balance) / maxBal) * 100, 3)}%`, transformOrigin: "right", animationDelay: `${Math.min(k * 25, 450) + 120}ms` }} />
                          </span>
                        </span>
                      </td>
                      <td className="stack-corner px-2 py-2 text-right">
                        {!viewer && <IconButton size={36} label={`Delete ${r.type.toLowerCase()} of ${taka(r.borrowed ?? r.repaid ?? 0)} on ${dateLong(r.iso)}`} onClick={() => askDelete(r)} className="text-slate-400 hover:bg-bad-tint hover:text-bad"><TrashIcon size={16} /></IconButton>}
                      </td>
                    </tr>
                    {isOpen && plan && (
                      <tr className="border-b border-soft bg-subtle"><td colSpan={7} className="stack-full p-3 sm:p-4"><OneSchedule plan={plan} today={today} /></td></tr>
                    )}
                  </Fragment>
                );
              })}
              {filtered && from && (
                <tr className="border-b border-soft bg-subtle/60"><td className={`${TD} text-slate-500`} colSpan={5}>Opening balance, before {dateLong(from)}</td><td data-label="Opening balance" className={`${TD} money text-right`}>{bal(statement.opening)}</td><td /></tr>
              )}
              {!shownRows.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">{statement.rows.length || !filtered ? (filtered || show !== "all" || ql ? "No entries match." : "Nothing recorded for this person yet.") : "No entries in this date range."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered && (
          <p className="m-0 border-t border-line px-4 py-2.5 text-[12.5px] text-slate-500 sm:px-5">
            Opening {bal(statement.opening)} + borrowed {taka(statement.borrowed)} − repaid {taka(statement.repaid)} = closing {bal(statement.closing)}
          </p>
        )}
      </SectionCard>

      {dialog === "loan" && (
        <AddDebtorDialog mode="loan" title={`Add loan — ${p.name}`} account={account} knownNames={data.people.map((x) => x.name)}
          lockedPerson={{ name: p.name, initials: p.initials, owes: p.owes }}
          onClose={() => setDialog(null)} onAdded={(_, t) => { setDialog(null); setFlash(t); }} />
      )}
      {dialog === "card" && (
        <CardPurchaseDialog cards={data.cards} knownNames={data.people.map((x) => x.name)} initialPayer={p.name}
          onClose={() => setDialog(null)} onSaved={(t) => { setDialog(null); setFlash(t); }} />
      )}
      {dialog === "repay" && <RepayDialog p={p} targets={targets} account={account} onClose={() => setDialog(null)} onSaved={(t) => { setDialog(null); setFlash(t); }} />}
      {dialog === "edit" && <EditPersonDialog p={person} onClose={() => setDialog(null)} onSaved={(t) => { setDialog(null); setFlash(t); }} />}
      {dialog === "pdf" && <ExportPdfDialog personId={personId} name={p.name} today={today} initial={{ from, to }} onClose={() => setDialog(null)} />}
      {deleting && (
        <DeleteDialog data={data} today={today} items={deleting.items} title={deleting.title} personId={personId} personName={p.name}
          wholeHistory={deleting.whole} onClose={() => setDeleting(null)}
          onDone={(msg, removed) => { setDeleting(null); setFlash(msg); if (removed) router.push("/debtors"); }} />
      )}
    </Shell>
  );
}

const TH = "px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500";
const TD = "px-4 py-3";
const bal = (n: number) => (n < 0 ? `${taka(n)} credit` : taka(n));

/** The month chart for one person: borrowed (brass), repaid (jade), balance owed at month end (blue line). */
const PERSON_LABELS: FlowLabels = {
  a: "Borrowed", b: "Repaid", line: "Owed at month end", lineNote: "What they owed at each month end", net: "Repaid − borrowed",
  count: (n) => `${n} ${n === 1 ? "entry" : "entries"}`, colors: { a: "var(--color-owed-bar)", b: "var(--color-chart-in)", line: "var(--color-info)" },
};
