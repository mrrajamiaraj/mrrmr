"use client";

import { useState, useTransition } from "react";
import { HeaderButton, Shell } from "@/components/shell";
import { Figure, Statement } from "@/components/balance-editor";
import { PlusIcon } from "@/components/icons";
import { ErrorBox, Modal, btnDanger, btnGhost, btnPrimary } from "@/components/modal";
import { Spinner, UnderlineTabs } from "@/components/motion";
import { Flash } from "@/components/debtors/bits";
import { deleteContribution, deleteExpense, saveContribution, saveExpense } from "@/lib/research-actions";
import {
  CONTRIBUTION_NOTES, DEFAULT_FACILITIES, DEFAULT_MEMBERS, mergeNames,
  type ResearchContribution, type ResearchData, type ResearchExpense,
} from "@/lib/research";
import { dateLong, taka, todayIso } from "@/lib/format";
import { AnalyticsTab, ContributionsTab, LedgerTab, MonthlyTab, SettlementTab, takaDec, type DialogState } from "./research-tabs";

type Tab = "ledger" | "contributions" | "settlement" | "analytics" | "monthly";

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

  const tabs: [Tab, string, number | null][] = [
    ["ledger", "Expenses", expenses.length],
    ["contributions", "Contributions", contributions.length],
    ["settlement", "Settlement", null],
    ["analytics", "By facility & member", null],
    ["monthly", "By month", null],
  ];

  const actions = (
    <>
      <HeaderButton variant="outline" onClick={() => setDialog({ kind: "contribution", row: null })}>
        <PlusIcon size={15} />Record contribution
      </HeaderButton>
      <HeaderButton onClick={() => setDialog({ kind: "expense", row: null })}>
        <PlusIcon size={15} />Add expense
      </HeaderButton>
    </>
  );

  const subtitle = "Clinical research spending, who paid for it, and how the team settles up.";

  if (data.missingTables) {
    return (
      <Shell subtitle={subtitle}>
        <section className="mx-auto w-full max-w-[720px] rounded-lg border border-owed-line bg-owed-tint p-4 sm:p-6">
          <h2 className="m-0 text-xl font-semibold text-owed">One-time setup needed</h2>
          <p className="mb-0 mt-2 text-[15px] text-slate-700">
            The research tables don&apos;t exist in Supabase yet. Open the Supabase dashboard → SQL Editor → New query, paste the
            contents of <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-sm">supabase/migrations/0003_research_ledger.sql</code>,
            click <strong>Run</strong>, then refresh this page.
          </p>
        </section>
      </Shell>
    );
  }

  return (
    <Shell subtitle={subtitle} actions={actions}>
      <Statement label="Key figures" cols={4}>
        <Figure label="Spent" value={totalExp} note={`${expenses.length} expenses`} />
        <Figure label="Contributed" value={totalCon} note={`${contributions.length} member payments`} />
        <Figure label={net < 0 ? "Short by" : "Left over"} value={net} tone={net < 0 ? "owed" : "good"}
          note={net < 0 ? "Contributions don't cover spending yet" : "Contributions cover all spending"} />
        <Figure label="Average expense" value={takaDec(Math.round(avg * 100) / 100)} note={`Largest ${taka(peak)}`} />
      </Statement>

      <div className="border-b border-line">
        <UnderlineTabs label="Research views" tabs={tabs} value={tab} onChange={setTab} />
      </div>

      <Flash text={flash} />

      <div key={tab} className="flex animate-fade-in flex-col gap-5 sm:gap-6">
        {tab === "ledger" && <LedgerTab expenses={expenses} facilities={facilities} members={members} setDialog={setDialog} />}
        {tab === "contributions" && <ContributionsTab contributions={contributions} members={members} setDialog={setDialog} />}
        {tab === "settlement" && (
          <SettlementTab expenses={expenses} contributions={contributions} members={members} totalExp={totalExp} totalCon={totalCon} setDialog={setDialog} />
        )}
        {tab === "analytics" && <AnalyticsTab expenses={expenses} facilities={facilities} members={members} totalExp={totalExp} onSettlement={() => setTab("settlement")} />}
        {tab === "monthly" && <MonthlyTab expenses={expenses} />}
      </div>

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
          {pending && <Spinner />}{pending ? "Saving…" : row ? "Save changes" : "Add expense"}
        </button>
      </>}>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <label className="field-label">Date<input type="date" className="field-input" value={f.spent_on} onChange={set("spent_on")} /></label>
        <label className="field-label">Amount (৳) *<input type="number" min="1" inputMode="decimal" className="field-input font-mono" value={f.amount} onChange={set("amount")} placeholder="0" /></label>
        <label className="field-label">Facility / center *
          <input list="research-facilities" className="field-input border-2 border-brand-2" value={f.facility} onChange={set("facility")} autoComplete="off" />
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
        <button type="button" disabled={pending} className={btnPrimary}
          onClick={() => start(async () => {
            const r = await saveContribution(row?.id ?? null, { ...f, amount: Number(f.amount) });
            if (r.error) setError(r.error);
            else onSaved(`${row ? "Updated" : "Recorded"} ${taka(Number(f.amount))} contribution from ${f.member.trim()}.`);
          })}>
          {pending && <Spinner />}{pending ? "Saving…" : row ? "Save changes" : "Record contribution"}
        </button>
      </>}>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <label className="field-label sm:col-span-2">Member *
          <input list="research-members-c" className="field-input border-2 border-info" value={f.member} onChange={set("member")} autoComplete="off" placeholder="e.g. Adnan, Somik" />
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
        <button type="button" disabled={pending} className={btnDanger}
          onClick={() => start(async () => { const r = await run(); if (r.error) setError(r.error); else onDone("Entry deleted."); })}>
          {pending && <Spinner />}{pending ? "Deleting…" : "Delete"}
        </button>
      </>}>
      <div className="flex flex-col gap-3 p-5 text-[15px]">
        <p className="m-0">This permanently deletes {what}. Export a CSV first if you want a copy.</p>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}
