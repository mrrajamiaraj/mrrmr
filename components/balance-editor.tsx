"use client";

import { useState, useTransition } from "react";
import { useViewer } from "@/components/shell";
import { CountUp, Spinner } from "@/components/motion";
import { taka } from "@/lib/format";

const TONE = { ink: "text-ink", owed: "text-owed", good: "text-brand-2", muted: "text-slate-400" } as const;
const ACCENT = { ink: "bg-ink", owed: "bg-owed-bar", good: "bg-brand-2", muted: "bg-line-strong" } as const;
export type Tone = keyof typeof TONE;

/** One row of figures split by hairlines, read left to right like a statement: now + owed = after. */
export function Statement({ label, cols = 3, children }: { label: string; cols?: 3 | 4; children: React.ReactNode }) {
  return (
    <section
      aria-label={label}
      className={`spot grid overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-card)] ${cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-2 md:grid-cols-3 max-md:[&>*:first-child]:col-span-2 max-md:[&>*:nth-child(3)]:border-l"} [&>*]:border-line [&>*+*]:border-t md:[&>*+*]:border-l md:[&>*+*]:border-t-0`}
    >
      {children}
    </section>
  );
}

/** A labelled figure. A number value is shown as taka and rolls to its new value when it changes. */
export function Figure({ label, value, note, tone = "ink", action }: {
  label: React.ReactNode; value: string | number; note?: React.ReactNode; tone?: Tone; action?: React.ReactNode;
}) {
  return (
    <div className="group/fig relative flex min-w-0 flex-col gap-1 px-4 py-4 sm:px-5 transition-colors duration-200 hover:bg-subtle">
      {/* Tone marker: a short bar at the top edge that widens on hover. */}
      <span aria-hidden="true" className={`absolute left-4 top-0 h-[3px] sm:left-5 w-6 rounded-b-full transition-[width] duration-300 ease-[var(--ease-out-expo)] group-hover/fig:w-12 ${ACCENT[tone]}`} />
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="caption">{label}</span>
        {action}
      </div>
      <div className={`money text-[clamp(24px,2.6vw,30px)] leading-tight tracking-[-0.02em] ${TONE[tone]}`}>
        {typeof value === "number" ? <CountUp value={value} format={taka} /> : value}
      </div>
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
        value={value}
        note={footnote}
        action={!viewer && (
          <button type="button" onClick={() => { setDraft(String(value)); setError(""); setEditing(true); }}
            className="rounded-md border border-transparent px-2 py-0.5 text-[12.5px] font-medium text-brand-2 opacity-80 hover:border-good-line hover:bg-good-tint hover:opacity-100 group-hover/fig:opacity-100">
            Edit
          </button>
        )}
      />
    );
  }

  return (
    <div className="flex animate-fade-in flex-col gap-2 bg-subtle px-5 py-4">
      <label className="flex flex-col gap-1.5">
        <span className="caption">{inputLabel}</span>
        <span className="flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:border-brand-2 focus-within:shadow-[0_0_0_3px_rgba(46,107,82,0.12)]">
          <span aria-hidden="true" className="money text-slate-500">৳</span>
          <input
            type="number" min="0" step="1" autoFocus value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") save(); else if (e.key === "Escape") setEditing(false); }}
            className="money min-w-0 flex-auto bg-transparent text-[20px] outline-none"
          />
        </span>
      </label>
      {error && <div role="alert" className="animate-fade-in text-[13px] font-medium text-bad">{error}</div>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={pending} className="inline-flex min-h-9 flex-auto items-center justify-center gap-2 rounded-lg bg-brand px-3 text-[13.5px] font-medium text-white hover:bg-brand-hover">
          {pending && <Spinner size={13} />}
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="min-h-9 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] text-slate-700 hover:bg-soft">
          Cancel
        </button>
      </div>
    </div>
  );
}
