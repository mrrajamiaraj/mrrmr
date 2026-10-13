"use client";

import { useState, useTransition } from "react";
import { Shell } from "@/components/shell";
import { PlusIcon } from "@/components/icons";
import { ErrorBox, Modal, btnGhost, btnPrimary } from "@/components/modal";
import { Flash } from "@/components/debtors/bits";
import { deleteContribution, deleteExpense, saveContribution, saveExpense } from "@/lib/research-actions";
import {
  CONTRIBUTION_NOTES, DEFAULT_FACILITIES, DEFAULT_MEMBERS, mergeNames,
  type ResearchContribution, type ResearchData, type ResearchExpense,
} from "@/lib/research";
import { dateLong, taka, todayIso } from "@/lib/format";
import { AnalyticsTab, ContributionsTab, LedgerTab, MonthlyTab, SettlementTab, takaDec, type DialogState } from "./research-tabs";

type Tab = "ledger" | "contributions" | "settlement" | "analytics" | "monthly";

const FlaskIcon = () => (
  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7 15h10" />
  </svg>
);

export function ResearchView({ data }: { data: ResearchData }) {
  const [tab, setTab] = useState<Tab>("ledger");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [flash, setFlash] = useState("");

  const { expenses, contributions } = data;
  const facilities = mergeNames(DEFAULT_FACILITIES, expenses.map((e) => e.facility));
  const members = mergeNames(DEFAULT_MEMBERS, [...expenses.map((e) => e.member), ...contributions.map((c) => c.member)]);

  const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
  const totalCon = contributions.reduce((s, c) => s + c.amount, 0);
  const net = totalCon - totalExp;
  const avg = expenses.length ? totalExp / expenses.length : 0;
  const peak = expenses.reduce((m, e) => Math.max(m, e.amount), 0);

  const kpis = [
    { label: "Total expenses", value: taka(totalExp), sub: `${expenses.length} total transactions`, glyph: "$", line: "#10B981", soft: "#D1FAE5", ink: "#047857", val: "#0F172A" },
    { label: "Total contributions", value: taka(totalCon), sub: `${contributions.length} member payments`, glyph: "⇄", line: "#6366F1", soft: "#E0E7FF", ink: "#4338CA", val: "#4338CA" },
    { label: "Net settlement balance", value: `${net < 0 ? "-" : ""}${taka(net)}`, sub: net < 0 ? `Deficit of ${taka(net)}` : `Surplus of ${taka(net)}`, glyph: "±", line: net < 0 ? "#F43F5E" : "#10B981", soft: net < 0 ? "#FFE4E6" : "#D1FAE5", ink: net < 0 ? "#BE123C" : "#047857", val: net < 0 ? "#BE123C" : "#047857" },
    { label: "Average expense", value: takaDec(Math.round(avg * 100) / 100), sub: `Peak: ${taka(peak)}`, glyph: "↗", line: "#F59E0B", soft: "#FEF3C7", ink: "#B45309", val: "#0F172A" },
  ];

  const tabs: [Tab, string][] = [
    ["ledger", `Expense Ledger (${expenses.length})`],
    ["contributions", `Member Contributions (${contributions.length})`],
    ["settlement", "Settlement & Balances"],
    ["analytics", "Facility & Team Analytics"],
    ["monthly", "Monthly Trends"],
  ];

  const actions = (
    <>
      <button type="button" onClick={() => setDialog({ kind: "contribution", row: null })}
        className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#4F46E5] px-4 text-[15px] font-semibold text-white">
        <PlusIcon size={16} />Record Contribution
      </button>
      <button type="button" onClick={() => setDialog({ kind: "expense", row: null })}
        className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#10B981] px-4 text-[15px] font-semibold text-[#04241B]">
        <PlusIcon size={16} />Add Expense
      </button>
    </>
  );

  if (data.missingTables) {
    return (
      <Shell icon={<FlaskIcon />} subtitle="Research Finance Ledger — clinical research expense & finance management">
        <section className="mx-auto w-full max-w-[720px] rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-6">
          <h2 className="m-0 text-xl font-bold text-[#92400E]">One-time setup needed</h2>
          <p className="mb-0 mt-2 text-[15px] text-slate-700">
            The research tables don&apos;t exist in Supabase yet. Open the Supabase dashboard → SQL Editor → New query, paste the
            contents of <code className="rounded bg-white px-1.5 py-0.5 font-mono text-sm">supabase/migrations/0003_research_ledger.sql</code>,
            click <strong>Run</strong>, then refresh this page.
          </p>
        </section>
      </Shell>
    );
  }

  return (
    <Shell icon={<FlaskIcon />} subtitle="Research Finance Ledger — clinical research expense & finance management" actions={actions}>
      <section aria-label="Key figures" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        {kpis.map((k) => (
          <div key={k.label} className="flex flex-col gap-3 rounded-[14px] border border-line border-b-4 bg-white p-[18px]" style={{ borderBottomColor: k.line }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-slate-700">{k.label}</span>
              <span aria-hidden="true" className="flex size-[30px] flex-none items-center justify-center rounded-lg font-bold" style={{ background: k.soft, color: k.ink }}>{k.glyph}</span>
            </div>
            <div className="money text-2xl" style={{ color: k.val }}>{k.value}</div>
            <div className="text-[13px] text-slate-500">{k.sub}</div>
          </div>
        ))}
      </section>

      <div role="tablist" aria-label="Research views" className="flex gap-2 overflow-x-auto rounded-2xl border border-line bg-white p-2">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`min-h-11 whitespace-nowrap rounded-[10px] px-4 text-[15px] font-semibold ${tab === key ? "bg-brand text-white" : "text-slate-700 hover:bg-soft"}`}>
            {label}
          </button>
        ))}
      </div>

      <Flash text={flash} />

      {tab === "ledger" && <LedgerTab expenses={expenses} facilities={facilities} members={members} setDialog={setDialog} />}
      {tab === "contributions" && <ContributionsTab contributions={contributions} members={members} setDialog={setDialog} />}
      {tab === "settlement" && (
        <SettlementTab expenses={expenses} contributions={contributions} members={members} totalExp={totalExp} totalCon={totalCon} setDialog={setDialog} />
      )}
      {tab === "analytics" && <AnalyticsTab expenses={expenses} facilities={facilities} members={members} totalExp={totalExp} onSettlement={() => setTab("settlement")} />}
      {tab === "monthly" && <MonthlyTab expenses={expenses} />}

      {dialog?.kind === "expense" && (
        <ExpenseDialog row={dialog.row} facilities={facilities} members={members} onClose={() => setDialog(null)}
          onSaved={(t) => { setDialog(null); setFlash(t); }} />
      )}
      {dialog?.kind === "contribution" && (
        <ContributionDialog row={dialog.row} member={dialog.member} members={members} onClose={() => setDialog(null)}
          onSaved={(t) => { setDialog(null); setFlash(t); }} />
      )}
      {dialog?.kind === "delete-expense" && (
        <ConfirmDelete
          what={`the ${taka(dialog.row.amount)} expense “${dialog.row.description}” from ${dateLong(dialog.row.spent_on)}`}
          run={() => deleteExpense(dialog.row.id)}
          onClose={() => setDialog(null)} onDone={(t) => { setDialog(null); setFlash(t); }} />
      )}
      {dialog?.kind === "delete-contribution" && (
        <ConfirmDelete
          what={`${dialog.row.member}'s ${taka(dialog.row.amount)} contribution from ${dateLong(dialog.row.paid_on)}`}
          run={() => deleteContribution(dialog.row.id)}
          onClose={() => setDialog(null)} onDone={(t) => { setDialog(null); setFlash(t); }} />
      )}
    </Shell>
  );
}

function ExpenseDialog({ row, facilities, members, onClose, onSaved }: {
  row: ResearchExpense | null; facilities: string[]; members: string[]; onClose: () => void; onSaved: (t: string) => void;
}) {
  const [f, setF] = useState({
    spent_on: row?.spent_on ?? todayIso(),
    facility: row?.facility ?? facilities[0] ?? "",
    member: row?.member ?? members[0] ?? "",
    description: row?.description ?? "",
    tag: row?.tag ?? "",
    amount: row ? String(row.amount) : "",
  });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setError(""); };

  return (
    <Modal title={row ? "Edit expense" : "Add expense"} onClose={onClose} maxWidth={580}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={pending} className={btnPrimary}
          onClick={() => start(async () => {
            const r = await saveExpense(row?.id ?? null, { ...f, amount: Number(f.amount) });
            if (r.error) setError(r.error);
            else onSaved(`${row ? "Updated" : "Added"} ${taka(Number(f.amount))} expense at ${f.facility.trim()} paid by ${f.member.trim()}.`);
          })}>
          {pending ? "Saving…" : row ? "Save changes" : "Add expense"}
        </button>
      </>}>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <label className="field-label">Date<input type="date" className="field-input" value={f.spent_on} onChange={set("spent_on")} /></label>
        <label className="field-label">Amount (৳) *<input type="number" min="1" inputMode="decimal" className="field-input font-mono" value={f.amount} onChange={set("amount")} placeholder="0" /></label>
        <label className="field-label">Facility / center *
          <input list="research-facilities" className="field-input border-2 border-[#14B8A6]" value={f.facility} onChange={set("facility")} autoComplete="off" />
          <datalist id="research-facilities">{facilities.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        <label className="field-label">Paid by *
          <input list="research-members" className="field-input" value={f.member} onChange={set("member")} autoComplete="off" />
          <datalist id="research-members">{members.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        <label className="field-label sm:col-span-2">Description
          <input className="field-input" value={f.description} onChange={set("description")} placeholder={`Leave empty for “${f.facility || "BHS"} [${f.member || "Raja"}]”`} />
        </label>
        <label className="field-label sm:col-span-2">Tag (optional)
          <input className="field-input" value={f.tag} onChange={set("tag")} placeholder="e.g. Printer Vara, DVD Recording, Dicom App" />
        </label>
        {error && <ErrorBox className="sm:col-span-2">{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

function ContributionDialog({ row, member, members, onClose, onSaved }: {
  row: ResearchContribution | null; member?: string; members: string[]; onClose: () => void; onSaved: (t: string) => void;
}) {
  const [f, setF] = useState({
    paid_on: row?.paid_on ?? todayIso(),
    member: row?.member ?? member ?? "",
    note: row?.note ?? "Cash",
    amount: row ? String(row.amount) : "",
  });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setError(""); };

  return (
    <Modal title={row ? "Edit contribution" : "Record contribution"} onClose={onClose} maxWidth={520}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={pending} className="min-h-11 rounded-[10px] bg-[#4F46E5] px-5 text-[15px] font-semibold text-white"
          onClick={() => start(async () => {
            const r = await saveContribution(row?.id ?? null, { ...f, amount: Number(f.amount) });
            if (r.error) setError(r.error);
            else onSaved(`${row ? "Updated" : "Recorded"} ${taka(Number(f.amount))} contribution from ${f.member.trim()}.`);
          })}>
          {pending ? "Saving…" : row ? "Save changes" : "Record contribution"}
        </button>
      </>}>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <label className="field-label sm:col-span-2">Member *
          <input list="research-members-c" className="field-input border-2 border-[#6366F1]" value={f.member} onChange={set("member")} autoComplete="off" placeholder="e.g. Adnan, Somik" />
          <datalist id="research-members-c">{members.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        <label className="field-label">Amount (৳) *<input type="number" min="1" inputMode="decimal" className="field-input font-mono" value={f.amount} onChange={set("amount")} placeholder="0" /></label>
        <label className="field-label">Date<input type="date" className="field-input" value={f.paid_on} onChange={set("paid_on")} /></label>
        <label className="field-label sm:col-span-2">Notes &amp; reference
          <input list="research-notes" className="field-input" value={f.note} onChange={set("note")} autoComplete="off" />
          <datalist id="research-notes">{CONTRIBUTION_NOTES.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        {error && <ErrorBox className="sm:col-span-2">{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

function ConfirmDelete({ what, run, onClose, onDone }: {
  what: string; run: () => Promise<{ error?: string }>; onClose: () => void; onDone: (t: string) => void;
}) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <Modal title="Delete this entry?" onClose={onClose} maxWidth={480}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={pending} className="min-h-11 rounded-[10px] bg-[#B91C1C] px-5 text-[15px] font-semibold text-white"
          onClick={() => start(async () => { const r = await run(); if (r.error) setError(r.error); else onDone("Entry deleted."); })}>
          {pending ? "Deleting…" : "Delete"}
        </button>
      </>}>
      <div className="flex flex-col gap-3 p-5 text-[15px]">
        <p className="m-0">This permanently deletes {what}. Export a CSV first if you want a copy.</p>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}
