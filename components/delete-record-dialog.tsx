"use client";

import { useState, useTransition } from "react";
import { Modal, ErrorBox, btnGhost } from "@/components/modal";
import { TrashIcon } from "@/components/icons";
import { deleteRecord, deleteRecords, type RecordKind } from "@/lib/actions";
import { dateLong, taka } from "@/lib/format";

export type DeleteTarget = {
  kind: RecordKind;
  id: string;
  amount: number;
  iso: string;
  /** e.g. "Loan to Rahim — Medical bill" */
  what: string;
  /** what "undo" does to the balance, e.g. "Put ৳5,000 back into City Bank"; null = no balance option */
  undo: string | null;
};

/** Undo wording for each record type; `place` is the account or card name. */
export function undoText(kind: RecordKind, amount: number, place: string, paidFor?: "loan" | "card") {
  const a = taka(amount);
  if (kind === "loan") return `Put ${a} back into ${place}`;
  if (kind === "card_use") return `Take ${a} off the ${place} balance`;
  return paidFor === "card" ? `Add ${a} back to the ${place} balance` : `Take ${a} back out of ${place}`;
}

export function DeleteButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title="Delete permanently"
      className="inline-flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-[#FEE2E2] hover:text-[#B91C1C]">
      <TrashIcon size={16} />
    </button>
  );
}

export function DeleteRecordDialog({ target: t, onClose, onDone }: {
  target: DeleteTarget;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [undo, setUndo] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const r = await deleteRecord(t.kind, t.id, undo && !!t.undo);
      if (r.error) return setError(r.error);
      onDone(`Deleted ${taka(t.amount)} record${undo && t.undo ? " and updated the balance" : ""}.`);
    });
  }

  return (
    <Modal title="Delete permanently?" onClose={onClose} maxWidth={500}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={pending} onClick={run}
          className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#B91C1C] px-5 text-[15px] font-semibold text-white">
          <TrashIcon size={16} />
          {pending ? "Deleting…" : "Delete forever"}
        </button>
      </>}>
      <div className="flex flex-col gap-3.5 p-5 text-[15px]">
        <div className="rounded-xl border border-line bg-[#F8FAFC] p-3.5">
          <div className="font-semibold">{t.what}</div>
          <div className="text-sm text-slate-600">{dateLong(t.iso)} · <span className="money">{taka(t.amount)}</span></div>
        </div>
        <p className="m-0">This removes it from every page and every total. <strong>It cannot be undone</strong> — export a CSV first if you want a copy.</p>
        {t.undo && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3.5">
            <input type="checkbox" checked={undo} onChange={(e) => setUndo(e.target.checked)} className="mt-1 size-5 flex-none accent-[#B91C1C]" />
            <span>
              <span className="block font-semibold">{t.undo}</span>
              <span className="block text-sm text-[#92400E]">
                Tick this only if the balance changed when you saved this record. Leave it unticked to just remove it from history.
              </span>
            </span>
          </label>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

/** Deletes every record in one person's history at once. */
export function ClearHistoryDialog({ name, records, onClose, onDone }: {
  name: string;
  records: { kind: RecordKind; id: string }[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [undo, setUndo] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const n = records.length;

  function run() {
    start(async () => {
      const r = await deleteRecords(records, undo);
      if (r.error) return setError(r.error);
      onDone(`Cleared ${n} record${n === 1 ? "" : "s"} from ${name}'s history${undo ? " and updated the balances" : ""}.`);
    });
  }

  return (
    <Modal title="Clear all history?" onClose={onClose} maxWidth={500}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={pending} onClick={run}
          className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#B91C1C] px-5 text-[15px] font-semibold text-white">
          <TrashIcon size={16} />
          {pending ? "Clearing…" : `Clear ${n} record${n === 1 ? "" : "s"}`}
        </button>
      </>}>
      <div className="flex flex-col gap-3.5 p-5 text-[15px]">
        <p className="m-0">
          This permanently deletes all <strong>{n}</strong> record{n === 1 ? "" : "s"} shown in {name}&apos;s history and
          removes them from every page and every total. {name} stays in your list so you can add new records later.{" "}
          <strong>It cannot be undone</strong> — export a CSV first if you want a copy.
        </p>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3.5">
          <input type="checkbox" checked={undo} onChange={(e) => setUndo(e.target.checked)} className="mt-1 size-5 flex-none accent-[#B91C1C]" />
          <span>
            <span className="block font-semibold">Also undo their effect on the bank and card balances</span>
            <span className="block text-sm text-[#92400E]">
              Tick this only if the balances changed when you saved these records. Leave it unticked to just remove them from history.
            </span>
          </span>
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}
