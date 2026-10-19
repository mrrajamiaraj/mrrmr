"use client";

import { useState, useTransition } from "react";
import { PencilIcon } from "@/components/icons";
import { useViewer } from "@/components/shell";
import { taka } from "@/lib/format";

/** Equation tile with an inline "Change" editor (bank: green, card: rose). */
export function BalanceEditor({
  label,
  inputLabel,
  value,
  footnote,
  tone,
  onSave,
}: {
  label: string;
  inputLabel: string;
  value: number;
  footnote: string;
  tone: "bank" | "card";
  onSave: (n: number) => Promise<{ error?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const bank = tone === "bank";
  const viewer = useViewer();

  function save() {
    const n = Math.round(Number(draft) * 100) / 100;
    if (draft === "" || Number.isNaN(n) || n < 0) return setError("Enter a balance of 0 or more.");
    start(async () => {
      const r = await onSave(n);
      if (r.error) return setError(r.error);
      setEditing(false);
    });
  }

  return (
    <div
      className={`flex flex-[1_1_280px] flex-col gap-2.5 rounded-2xl border border-b-4 p-[22px] ${
        bank ? "border-line border-b-[#10B981] bg-white" : "border-[#FECDD3] border-b-[#F43F5E] bg-[#FFF5F6]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-700">{label}</span>
        {!editing && !viewer && (
          <button
            type="button"
            onClick={() => { setDraft(String(value)); setError(""); setEditing(true); }}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold ${
              bank ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]" : "border-[#FECDD3] bg-white text-[#BE123C]"
            }`}
          >
            <PencilIcon size={14} />
            Change
          </button>
        )}
      </div>
      {!editing ? (
        <>
          <div className={`money text-[clamp(28px,3.4vw,38px)] ${bank ? "" : "text-[#9F1239]"}`}>{taka(value)}</div>
          <div className={`text-sm ${bank ? "text-[#047857]" : "text-[#BE123C]"}`}>● {footnote}</div>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {inputLabel}
            <span className={`flex min-h-[52px] items-center gap-2 rounded-[10px] border-2 bg-white px-3.5 ${bank ? "border-[#14B8A6]" : "border-[#F43F5E]"}`}>
              <span aria-hidden="true" className="money text-xl text-slate-600">৳</span>
              <input
                type="number" min="0" step="1" autoFocus value={draft}
                onChange={(e) => { setDraft(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && save()}
                className="money min-w-0 flex-auto bg-transparent text-[22px] outline-none"
              />
            </span>
          </label>
          {error && <div role="alert" className="text-[13.5px] font-semibold text-[#B91C1C]">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending} className="min-h-11 flex-auto rounded-[10px] bg-brand text-[15px] font-semibold text-white">
              {pending ? "Saving…" : "Save balance"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-[10px] border border-[#CBD5E1] bg-white px-3.5 text-[15px] font-medium text-slate-700">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function EqSign({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden="true" className="flex flex-none items-center justify-center px-0.5 text-[30px] font-bold text-slate-400">
      {children}
    </div>
  );
}
