"use client";

// The City Bank section's two graphic panels: the account balance (a dark jade "deck" with the figure counting up and
// an inline editor) and the City Mastercard debit tally (drawn as a debit card, with the quick "now used" entry).
// Same actions and rules as before: setAccountBalance, addDebitUse, setDebitUsed. Display only otherwise.

import { useState, useTransition } from "react";
import { useViewer } from "@/components/shell";
import { CountUp, Spinner } from "@/components/motion";
import { BankIcon, PencilIcon, PlusIcon } from "@/components/icons";
import { addDebitUse, setAccountBalance, setDebitUsed } from "@/lib/actions";
import { taka, timestampLong } from "@/lib/format";
import type { Account } from "@/lib/types";

const field = "money min-w-0 flex-auto rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[20px] text-white outline-none placeholder:text-white/40 focus:border-white/50";
const solid = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-white px-4 text-[14px] font-semibold text-[#0A2620] hover:bg-white/90";
const ghost = "inline-flex min-h-10 items-center rounded-lg border border-white/25 px-3 text-[14px] text-white/85 hover:bg-white/10";

/** Edit a money figure in place on a dark panel. */
function InlineEdit({ value, label, onSave, onDone }: { value: number; label: string; onSave: (n: number) => Promise<{ error?: string }>; onDone: () => void }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = () => {
    const n = Math.round(Number(draft) * 100) / 100;
    if (draft === "" || Number.isNaN(n) || n < 0) return setError("Enter 0 or more.");
    start(async () => { const r = await onSave(n); if (r.error) setError(r.error); else onDone(); });
  };
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-[12px] font-medium text-white/70">{label}
        <span className="flex items-center gap-2"><span aria-hidden="true" className="money text-white/60">৳</span>
          <input type="number" min="0" inputMode="decimal" autoFocus value={draft} className={field}
            onChange={(e) => { setDraft(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") save(); else if (e.key === "Escape") onDone(); }} />
        </span>
      </label>
      {error && <span role="alert" className="text-[13px] font-medium text-[#FFB4A6]">{error}</span>}
      <span className="flex gap-2">
        <button type="button" onClick={save} disabled={pending} className={solid}>{pending && <Spinner size={13} />}{pending ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onDone} className={ghost}>Cancel</button>
      </span>
    </div>
  );
}

export function BankBalancePanel({ account }: { account: Account }) {
  const viewer = useViewer();
  const [editing, setEditing] = useState(false);
  return (
    <section aria-label={`${account.name} balance`} className="deck flex min-h-[220px] flex-col justify-between gap-6 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl border border-white/15 bg-white/10 text-[#7DD4B8]"><BankIcon size={20} /></span>
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold">{account.name}</span>
            <span className="block text-[12px] text-white/55">{account.holder_name ?? "Savings account"}</span>
          </span>
        </span>
        {!viewer && !editing && (
          <button type="button" onClick={() => setEditing(true)} aria-label={`Edit the ${account.name} balance`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/20 px-3 text-[13px] font-medium text-white/85 hover:bg-white/10"><PencilIcon size={13} />Edit</button>
        )}
      </div>
      {editing ? (
        <InlineEdit value={account.balance} label={`New ${account.name} balance (৳)`} onSave={(n) => setAccountBalance(account.id, n)} onDone={() => setEditing(false)} />
      ) : (
        <div>
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/55">Balance</div>
          <div className="money mt-1 text-[clamp(34px,5vw,48px)] font-medium leading-none tracking-[-0.03em]"><CountUp value={account.balance} format={taka} duration={1300} intro /></div>
          <div className="mt-2 text-[12px] text-white/55">Updated {timestampLong(account.updated_at)} · the figure you keep up to date</div>
        </div>
      )}
    </section>
  );
}

/** The City Mastercard debit tally, drawn as the debit card itself; "now used" adds to the running total. */
export function DebitCardPanel({ account }: { account: Account }) {
  const viewer = useViewer();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [added, setAdded] = useState("");
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const add = () => {
    const n = Math.round(Number(draft) * 100) / 100;
    if (draft === "" || Number.isNaN(n) || n <= 0) return setError("Enter an amount above 0.");
    start(async () => {
      const r = await addDebitUse(account.id, n);
      if (r.error) return setError(r.error);
      setDraft(""); setAdded(`Added ${taka(n)}`);
    });
  };

  return (
    <section aria-label="City Mastercard debit card"
      className="relative isolate flex min-h-[220px] flex-col justify-between gap-5 overflow-hidden rounded-[18px] p-5 text-white shadow-[0_30px_60px_-30px_rgba(10,13,19,0.7)] sm:p-6"
      style={{ background: "linear-gradient(135deg, #2E2A2B 0%, #231F20 55%, #121011 100%)" }}>
      {/* City Bank red sweep, a card chip and contactless waves (card cues only — no network logo). */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 h-[260px] w-[420px] rotate-[-18deg] rounded-[50%] bg-[radial-gradient(closest-side,rgba(242,8,35,0.55),transparent)]" />
      <svg aria-hidden="true" className="pointer-events-none absolute right-5 top-16 -z-10 opacity-90" width="76" height="34" viewBox="0 0 76 34" fill="none">
        <defs><linearGradient id="dchip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#EAD9A8" /><stop offset=".5" stopColor="#C8A65A" /><stop offset="1" stopColor="#9B7A36" /></linearGradient></defs>
        <rect x="0" y="2" width="42" height="30" rx="6" fill="url(#dchip)" />
        <path d="M0 13h16M26 13h16M0 21h16M26 21h16M21 2v30" stroke="#7E6128" strokeOpacity=".55" strokeWidth="1.2" />
        <g stroke="#fff" strokeOpacity=".7" strokeWidth="2.4" strokeLinecap="round"><path d="M52 11a9 9 0 0 1 0 12" /><path d="M58 7a15 15 0 0 1 0 20" /><path d="M64 3a21 21 0 0 1 0 28" /></g>
      </svg>

      <div className="flex items-start justify-between gap-3">
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold">City Mastercard</span>
          <span className="block text-[12px] text-white/55">Debit card · spending tally</span>
        </span>
        {!viewer && !editing && (
          <button type="button" onClick={() => setEditing(true)} aria-label="Edit the debit card total used"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/20 px-3 text-[13px] font-medium text-white/85 hover:bg-white/10"><PencilIcon size={13} />Edit total</button>
        )}
      </div>

      {editing ? (
        <InlineEdit value={account.debit_used} label="New total used (৳)" onSave={(n) => setDebitUsed(account.id, n)} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/55">Total used</div>
            <div className="money mt-1 text-[clamp(30px,4.4vw,40px)] font-medium leading-none tracking-[-0.02em]"><CountUp value={account.debit_used} format={taka} duration={1300} intro /></div>
            <div className="mt-2 text-[12px] text-white/55">A running total you add to — it doesn&apos;t change the balance</div>
          </div>
          {!viewer && (
            <div className="flex w-full max-w-[300px] flex-col gap-1.5">
              <label className="text-[12px] font-medium text-white/70" htmlFor="debit-now">Just used</label>
              <span className="flex items-center gap-2">
                <input id="debit-now" type="number" min="0" inputMode="decimal" placeholder="0" value={draft} className={`${field} text-[17px]`}
                  onChange={(e) => { setDraft(e.target.value); setError(""); setAdded(""); }} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
                <button type="button" onClick={add} disabled={pending} className={solid}>{pending ? <Spinner size={13} /> : <PlusIcon size={15} />}Add</button>
              </span>
              {error && <span role="alert" className="text-[12.5px] font-medium text-[#FFB4A6]">{error}</span>}
              {!error && added && <span role="status" className="text-[12.5px] text-[#9FE3C9]">{added} to the total</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
