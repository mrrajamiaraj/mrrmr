"use client";

import { useState, useTransition } from "react";
import { useViewer } from "@/components/shell";
import { taka } from "@/lib/format";

const TONE = { ink: "text-ink", owed: "text-[#85570F]", good: "text-brand-2", muted: "text-slate-400" } as const;
export type Tone = keyof typeof TONE;

/** One row of figures split by hairlines, read left to right like a statement: now + owed = after. */
export function Statement({ label, cols = 3, children }: { label: string; cols?: 3 | 4; children: React.ReactNode }) {
  return (
    <section
      aria-label={label}
      className={`grid overflow-hidden rounded-lg border border-line bg-white ${cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"} [&>*]:border-line [&>*+*]:border-t md:[&>*+*]:border-l md:[&>*+*]:border-t-0`}
    >
      {children}
    </section>
  );
}

export function Figure({ label, value, note, tone = "ink", action }: {
  label: React.ReactNode; value: string; note?: React.ReactNode; tone?: Tone; action?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-5 py-4">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="caption">{label}</span>
        {action}
      </div>
      <div className={`money text-[clamp(24px,2.6vw,30px)] leading-tight ${TONE[tone]}`}>{value}</div>
      {note && <div className="text-[12.5px] text-slate-500">{note}</div>}
    </div>
  );
}

/** A Figure whose value the admin can change in place. */
export function BalanceEditor({
  label,
  inputLabel,
  value,
  footnote,
  onSave,
}: {
  label: string;
  inputLabel: string;
  value: number;
  footnote: string;
  onSave: (n: number) => Promise<{ error?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
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

  if (!editing) {
    return (
      <Figure
        label={label}
        value={taka(value)}
        note={footnote}
        action={!viewer && (
          <button type="button" onClick={() => { setDraft(String(value)); setError(""); setEditing(true); }}
            className="rounded px-1.5 py-0.5 text-[12.5px] font-medium text-brand-2 underline decoration-[#CADBD0] underline-offset-2 hover:bg-soft">
            Edit
          </button>
        )}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 px-5 py-4">
      <label className="flex flex-col gap-1.5">
        <span className="caption">{inputLabel}</span>
        <span className="flex min-h-11 items-center gap-2 rounded-md border border-[#D6D3CB] bg-white px-3 focus-within:border-brand-2">
          <span aria-hidden="true" className="money text-slate-500">৳</span>
          <input
            type="number" min="0" step="1" autoFocus value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="money min-w-0 flex-auto bg-transparent text-[20px] outline-none"
          />
        </span>
      </label>
      {error && <div role="alert" className="text-[13px] font-medium text-[#9B3426]">{error}</div>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={pending} className="min-h-9 flex-auto rounded-md bg-brand px-3 text-[13.5px] font-medium text-white">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="min-h-9 rounded-md border border-[#D6D3CB] bg-white px-3 text-[13.5px] text-slate-700">
          Cancel
        </button>
      </div>
    </div>
  );
}
