"use client";

import { useState, useTransition } from "react";
import { useViewer } from "@/components/shell";
import { BalanceEditor } from "@/components/balance-editor";
import { Spinner } from "@/components/motion";
import { addDebitUse, setDebitUsed } from "@/lib/actions";
import { taka } from "@/lib/format";

/** Debit card spending: type what was just used, and it is added to the running total, then the box clears. */
export function DebitUsed({ accountId, total }: { accountId: string; total: number }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [added, setAdded] = useState("");
  const [pending, start] = useTransition();
  const viewer = useViewer();

  function add() {
    const n = Math.round(Number(draft) * 100) / 100;
    if (draft === "" || Number.isNaN(n) || n <= 0) return setError("Enter an amount above 0.");
    start(async () => {
      const r = await addDebitUse(accountId, n);
      if (r.error) return setError(r.error);
      setDraft("");
      setAdded(`Added ${taka(n)}`);
    });
  }

  return (
    <section
      aria-label="City Bank AMEX debit card"
      className="spot grid overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-card)] md:grid-cols-2 [&>*]:border-line [&>*+*]:border-t md:[&>*+*]:border-l md:[&>*+*]:border-t-0"
    >
      {!viewer && (
        <div className="flex flex-col gap-2 px-4 py-4 sm:px-5">
          <label className="flex flex-col gap-1.5">
            <span className="caption">City Bank AMEX debit card — now used</span>
            <span className="flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:border-brand-2 focus-within:shadow-[var(--shadow-focus)]">
              <span aria-hidden="true" className="money text-slate-500">৳</span>
              <input
                type="number" min="0" step="1" inputMode="decimal" placeholder="0" value={draft}
                onChange={(e) => { setDraft(e.target.value); setError(""); setAdded(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                className="money min-w-0 flex-auto bg-transparent text-[20px] outline-none"
              />
              <button type="button" onClick={add} disabled={pending}
                className="inline-flex min-h-8 items-center gap-2 rounded-lg bg-brand px-3 text-[13.5px] font-medium text-white hover:bg-brand-hover">
                {pending && <Spinner size={13} />}
                {pending ? "Adding…" : "Add"}
              </button>
            </span>
          </label>
          {error && <div role="alert" className="animate-fade-in text-[13px] font-medium text-bad">{error}</div>}
          {!error && added && <div role="status" className="animate-fade-in text-[12.5px] text-brand-2">{added} to total used</div>}
        </div>
      )}
      <BalanceEditor
        label="City Bank AMEX debit card — total used"
        inputLabel="New total used (৳)"
        value={total}
        footnote="Every amount entered in now used, added up"
        onSave={(n) => setDebitUsed(accountId, n)}
      />
    </section>
  );
}
