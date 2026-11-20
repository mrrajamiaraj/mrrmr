"use client";

import { useState, useTransition } from "react";
import { Modal, ErrorBox } from "@/components/modal";
import { Button, buttonClass } from "@/components/ui";
import { DownloadIcon, FileIcon } from "@/components/icons";
import { RepayForm, type RepayTarget } from "@/components/debtors/repay-form";
import { Avatar } from "@/components/debtors/bits";
import { updatePerson } from "@/lib/actions";
import { dateLong, taka } from "@/lib/format";
import { slug } from "@/lib/statement";
import { isIsoDate } from "@/lib/validate";

export function EditPersonDialog({ p, onClose, onSaved }: {
  p: { id: string; name: string; relation: string | null; phone: string | null; notes: string | null };
  onClose: () => void; onSaved: (msg: string) => void;
}) {
  const [f, setF] = useState({ name: p.name, relation: p.relation ?? "", phone: p.phone ?? "", notes: p.notes ?? "" });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setError(""); };
  const save = () => start(async () => {
    const r = await updatePerson(p.id, f);
    if (r.error) return setError(r.error);
    onSaved(`Saved ${f.name.trim()}'s details.`);
  });
  return (
    <Modal title={`Edit ${p.name}`} onClose={onClose} maxWidth={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} pending={pending} pendingLabel="Saving…">Save</Button></>}>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <label className="field-label sm:col-span-2">Name<input className="field-input" value={f.name} onChange={set("name")} required aria-invalid={!f.name.trim() || undefined} /></label>
        <label className="field-label">Relation<input className="field-input" value={f.relation} onChange={set("relation")} placeholder="e.g. Friend, cousin" /></label>
        <label className="field-label">Phone<input className="field-input" value={f.phone} onChange={set("phone")} inputMode="tel" /></label>
        <label className="field-label sm:col-span-2">Notes<input className="field-input" value={f.notes} onChange={set("notes")} /></label>
        {error && <ErrorBox className="sm:col-span-2">{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

export function RepayDialog({ p, targets, account, onClose, onSaved }: {
  p: { id: string; name: string; first: string; initials: string; owes: number };
  targets: RepayTarget[]; account: { id: string; name: string } | null;
  onClose: () => void; onSaved: (msg: string) => void;
}) {
  return (
    <Modal title="Record a repayment" onClose={onClose} maxWidth={620}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-subtle px-3.5 py-2.5">
          <Avatar text={p.initials} size={34} />
          <div className="min-w-0"><div className="truncate font-semibold">{p.name}</div><div className="text-[13px] text-slate-600">Owes {taka(p.owes)} in total</div></div>
        </div>
        {targets.length ? <RepayForm key={p.owes} personId={p.id} first={p.first} targets={targets} mode="all" account={account} withDate onSaved={onSaved} />
          : <p className="m-0 text-[14px] text-slate-600">{p.first} has paid everything back.</p>}
      </div>
    </Modal>
  );
}

/**
 * Export a person's statement as a PDF — or, with `personId: null`, everyone's in one file (a summary page, then each
 * person's statement). Full history by default; a date range is optional (prefilled from the history filter). The
 * file comes from /export/pdf, which checks the admin session on the server.
 */
export function ExportPdfDialog({ personId, name, today, initial, onClose }: {
  personId: string | null; name: string; today: string; initial: { from: string; to: string }; onClose: () => void;
}) {
  const [mode, setMode] = useState<"all" | "range">(initial.from || initial.to ? "range" : "all");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const everyone = personId == null;
  const bad = mode === "range" && ((from && !isIsoDate(from)) || (to && !isIsoDate(to)) || (!!from && !!to && from > to) || (!from && !to));
  const q = new URLSearchParams(everyone ? { all: "1" } : { id: personId });
  if (mode === "range" && from) q.set("from", from);
  if (mode === "range" && to) q.set("to", to);
  const file = everyone
    ? `MRRMR-statements-everyone-${mode === "range" && from ? from : "start"}-to-${mode === "range" && to ? to : today}.pdf`
    : `MRRMR-statement-${slug(name)}-${mode === "range" && from ? from : "start"}-to-${mode === "range" && to ? to : today}.pdf`;
  const opt = "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-[14px]";

  return (
    <Modal title={everyone ? "Export everyone's statements (PDF)" : "Export PDF statement"} onClose={onClose} maxWidth={500}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <a href={bad ? undefined : `/export/pdf?${q}`} download={bad ? undefined : file} aria-disabled={bad || undefined}
          onClick={(e) => { if (bad) e.preventDefault(); else setTimeout(onClose, 300); }}
          className={buttonClass("primary", "md", bad ? "pointer-events-none opacity-60" : "")}>
          <DownloadIcon size={15} />Download PDF
        </a>
      </>}>
      <div className="flex flex-col gap-3 p-5">
        {everyone
          ? <p className="m-0 text-[13.5px] text-slate-600">One A4 file for <b className="text-ink">everyone</b>: a summary page (each person&apos;s borrowed, repaid, balance, owed today and next due, with totals), then each person&apos;s full statement with every loan, card purchase and repayment and the running balance.</p>
          : <p className="m-0 text-[13.5px] text-slate-600">An A4 statement for <b className="text-ink">{name}</b> only: summary totals and every entry with dates, amounts, repayments and the running balance.</p>}
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="sr-only">What to include</legend>
          <label className={`${opt} ${mode === "all" ? "border-brand-2 bg-good-tint" : "border-line"}`}>
            <input type="radio" name="pdf-range" checked={mode === "all"} onChange={() => setMode("all")} className="mt-0.5 size-[18px] accent-brand-2" />
            <span><span className="block font-medium">Full history</span><span className="text-[12.5px] text-slate-500">Every entry up to {dateLong(today)}</span></span>
          </label>
          <label className={`${opt} ${mode === "range" ? "border-brand-2 bg-good-tint" : "border-line"}`}>
            <input type="radio" name="pdf-range" checked={mode === "range"} onChange={() => setMode("range")} className="mt-0.5 size-[18px] accent-brand-2" />
            <span><span className="block font-medium">A date range</span><span className="text-[12.5px] text-slate-500">Starts with the opening balance carried in, so the running balance adds up</span></span>
          </label>
        </fieldset>
        {mode === "range" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="field-label">From<input type="date" className="field-input" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="field-label">To<input type="date" className="field-input" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
        {bad && <p role="alert" className="m-0 text-[13px] font-medium text-bad">{!from && !to ? "Pick a start date, an end date, or both." : "The start date must be on or before the end date."}</p>}
        <p className="m-0 flex items-center gap-2 text-[12.5px] text-slate-500"><FileIcon size={14} />{file}</p>
      </div>
    </Modal>
  );
}
