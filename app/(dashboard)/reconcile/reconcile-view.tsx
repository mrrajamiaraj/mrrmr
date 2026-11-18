"use client";

import { useState, useTransition } from "react";
import { Shell } from "@/components/shell";
import { UnderlineTabs } from "@/components/motion";
import { SectionCard, SectionHead } from "@/components/debtors/bits";
import { Modal, ErrorBox } from "@/components/modal";
import { Badge, Button, EmptyState, Money } from "@/components/ui";
import { InfoIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { reconcileBalance } from "@/lib/actions";
import { cardLabel } from "@/lib/ledger";
import { dateLong, taka, timestampLong } from "@/lib/format";
import { roundMoney, subMoney, toPaisa } from "@/lib/money";
import type { AuditRow, Adjustment } from "@/lib/audit-data";
import type { FinanceData } from "@/lib/types";

type Target = { kind: "account" | "card"; id: string; label: string; recorded: number; updated: string; meaning: string };

export function ReconcileView({ data, audit, today }: { data: FinanceData; audit: { ready: boolean; audit: AuditRow[]; adjustments: Adjustment[] }; today: string }) {
  const [tab, setTab] = useState<"reconcile" | "audit">("reconcile");
  const targets: Target[] = [
    ...data.accounts.map((a) => ({ kind: "account" as const, id: a.id, label: a.name, recorded: a.balance, updated: a.updated_at, meaning: "Money in the account" })),
    ...data.cards.map((c) => ({ kind: "card" as const, id: c.id, label: cardLabel(c), recorded: c.balance, updated: c.updated_at, meaning: "Amount owed on the card" })),
  ];
  return (
    <Shell subtitle="Compare recorded balances with your statements, correct them through traceable adjustments, and see every change.">
      {!audit.ready && (
        <div className="flex gap-2.5 rounded-xl border border-owed-line bg-owed-tint p-3.5 text-[13px] text-slate-700">
          <InfoIcon size={16} className="mt-0.5 flex-none text-owed" />
          <span><b>Comparing works now.</b> Recording adjustments and the audit trail need a database update: run <code className="rounded bg-surface px-1">supabase/migrations/0011_audit_and_reconcile.sql</code> in the Supabase SQL Editor. History starts from that moment.</span>
        </div>
      )}
      <div className="border-b border-line">
        <UnderlineTabs label="Views" value={tab} onChange={setTab} tabs={[["reconcile", "Reconcile", null], ["audit", "Audit trail", audit.ready ? audit.audit.length : null]]} />
      </div>
      {tab === "reconcile" ? (
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {targets.map((t) => <ReconcileCard key={t.id} t={t} today={today} ready={audit.ready} />)}
          </div>
          <SectionCard labelledBy="adj-h">
            <SectionHead id="adj-h" title="Adjustment history" sub="Every correction, with the figure before and after. Adjustments can't be edited or deleted." />
            {audit.adjustments.length ? (
              <ul className="m-0 list-none border-t border-line p-0">
                {audit.adjustments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-soft px-4 py-2.5 last:border-0 sm:px-5 text-[13.5px]">
                    <span><span className="font-medium">{targets.find((t) => t.id === a.target_id)?.label ?? a.target}</span>
                      <span className="block text-[12px] text-slate-500">Statement of {dateLong(a.statement_date)} · recorded {timestampLong(a.created_at)}{a.note ? ` · ${a.note}` : ""}</span></span>
                    <span className="text-right"><Money value={a.recorded} tone="muted" /> → <Money value={a.statement} /><span className="block text-[12px]"><Money value={a.delta} signed tone={a.delta < 0 ? "bad" : "good"} /></span></span>
                  </li>
                ))}
              </ul>
            ) : <div className="border-t border-line p-4"><EmptyState compact title="No adjustments yet" /></div>}
          </SectionCard>
        </div>
      ) : (
        <SectionCard labelledBy="aud-h">
          <SectionHead id="aud-h" title="Audit trail" sub="Every insert, update and delete on your records, newest first (last 200). Written by the database itself — not editable from the app." />
          {audit.ready && audit.audit.length ? (
            <ol className="m-0 list-none border-t border-line p-0">
              {audit.audit.map((r) => <AuditItem key={r.id} r={r} />)}
            </ol>
          ) : <div className="border-t border-line p-4"><EmptyState compact title={audit.ready ? "Nothing recorded yet" : "Not enabled yet"}>{audit.ready ? "Changes appear here as they happen." : "Run migration 0011 to start the audit trail."}</EmptyState></div>}
        </SectionCard>
      )}
    </Shell>
  );
}

function ReconcileCard({ t, today, ready }: { t: Target; today: string; ready: boolean }) {
  const [stmt, setStmt] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const s = roundMoney(stmt);
  const has = stmt !== "" && s >= 0;
  const delta = has ? subMoney(s, t.recorded) : 0;
  const matches = has && toPaisa(delta) === 0;

  return (
    <SectionCard labelledBy={`rc-${t.id}`}>
      <SectionHead id={`rc-${t.id}`} title={t.label} sub={`${t.meaning} · recorded ${timestampLong(t.updated)}`} />
      <div className="flex flex-col gap-3 border-t border-line p-4 sm:p-5">
        <div className="flex justify-between text-[13.5px]"><span className="text-slate-500">Recorded in MRRMR</span><Money value={t.recorded} tone={t.kind === "card" ? "bad" : "ink"} /></div>
        <label className="field-label">Statement figure (৳)
          <input type="number" inputMode="decimal" min="0" step="0.01" value={stmt} onChange={(e) => { setStmt(e.target.value); setError(""); }} className="field-input tabular-nums" />
        </label>
        {has && (
          <div role="status" className={`rounded-lg border p-2.5 text-[13px] ${matches ? "border-good-line bg-good-tint text-brand-ink" : "border-owed-line bg-owed-tint text-owed"}`}>
            {matches ? "✓ Matches the statement." : <>Difference: <Money value={delta} signed tone={delta < 0 ? "bad" : "good"} /> ({t.kind === "card" ? (delta > 0 ? "you owe more than recorded" : "you owe less than recorded") : (delta > 0 ? "more in the bank than recorded" : "less in the bank than recorded")})</>}
          </div>
        )}
        {has && !matches && (
          <Button variant="secondary" disabled={!ready} onClick={() => setConfirm(true)}>{ready ? "Record adjustment…" : "Adjustments need migration 0011"}</Button>
        )}
      </div>
      {confirm && (
        <Modal title="Record adjustment" onClose={() => setConfirm(false)} maxWidth={460}
          footer={<>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button pending={pending} pendingLabel="Recording…" onClick={() => start(async () => {
              const r = await reconcileBalance({ target: t.kind, id: t.id, statement: s, statementDate: date, note });
              if (r.error) return setError(r.error);
              toast(`${t.label} reconciled to ${taka(s)}. Adjustment recorded.`); setConfirm(false); setStmt(""); setNote("");
            })}>Confirm adjustment</Button>
          </>}>
          <div className="flex flex-col gap-3 p-5 text-[13.5px]">
            <p className="m-0">{t.label}: <Money value={t.recorded} tone="muted" /> → <Money value={s} /> (<Money value={delta} signed />). A permanent adjustment record is kept with both figures; it can't be edited or deleted.</p>
            <label className="field-label">Statement date<input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="field-input" /></label>
            <label className="field-label">Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. November statement" className="field-input" maxLength={300} /></label>
            {error && <ErrorBox>{error}</ErrorBox>}
          </div>
        </Modal>
      )}
    </SectionCard>
  );
}

const TABLE_LABEL: Record<string, string> = {
  accounts: "Bank account", cards: "Card", people: "Person", loans: "Loan", card_uses: "Card transaction", repayments: "Repayment",
  research_expenses: "Research expense", research_contributions: "Research contribution", balance_adjustments: "Adjustment",
};
const MONEY_FIELDS = ["balance", "amount", "debit_used", "credit_limit", "emi_charges", "statement"];

function AuditItem({ r }: { r: AuditRow }) {
  const changed = r.action === "update" && r.before && r.after
    ? Object.keys(r.after).filter((k) => !["updated_at"].includes(k) && JSON.stringify(r.before![k]) !== JSON.stringify(r.after![k])) : [];
  const row = (r.after ?? r.before ?? {}) as Record<string, unknown>;
  const summary = String(row.name ?? row.reason ?? row.reason_or_place ?? row.description ?? row.via ?? "");
  return (
    <li className="flex flex-col gap-0.5 border-b border-soft px-4 py-2.5 last:border-0 sm:px-5">
      <span className="flex flex-wrap items-center gap-2 text-[13.5px]">
        <Badge tone={r.action === "delete" ? "bad" : r.action === "insert" ? "good" : "info"} className="text-[10.5px]">{r.action}</Badge>
        <span className="font-medium">{TABLE_LABEL[r.table_name] ?? r.table_name}</span>
        {summary && <span className="truncate text-slate-500">{summary}</span>}
        <span className="ml-auto text-[12px] text-slate-500">{timestampLong(r.at)} · {new Date(r.at).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" })}</span>
      </span>
      {changed.length > 0 && (
        <span className="text-[12.5px] text-slate-600">
          {changed.map((k) => (
            <span key={k} className="mr-3 inline-block">{k}: {fmt(k, r.before![k])} → <b>{fmt(k, r.after![k])}</b></span>
          ))}
        </span>
      )}
      {r.action !== "update" && MONEY_FIELDS.some((k) => k in row) && <span className="text-[12.5px] text-slate-600">amount {fmt("amount", row.amount ?? row.balance)}</span>}
    </li>
  );
}
const fmt = (k: string, v: unknown) => (v == null ? "—" : MONEY_FIELDS.includes(k) ? taka(Number(v)) : String(v));
