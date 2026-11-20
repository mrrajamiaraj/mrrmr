"use client";

// The City Bank section's two graphic panels: the account balance (a dark jade "deck" with the figure counting up and
// an inline editor) and the City Bank AMEX debit card tally (drawn as the debit card, with the quick "now used" entry).
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
            <span className="block text-[12px] text-white/55">High Saving General Account{account.holder_name ? ` · ${account.holder_name}` : ""}</span>
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

/** A many-pointed star outline (the debit card's line pattern), as polygon points around (cx, cy). */
function starPoints(cx: number, cy: number, outer: number, inner: number, n: number) {
  return Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / n - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}
const STAR_A = starPoints(40, 125, 300, 70, 7);
const STAR_B = starPoints(40, 125, 230, 95, 7);

/** The City Bank AMEX debit card tally, drawn as the debit card itself; "now used" adds to the running total. */
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
    <section aria-label="City Bank AMEX debit card"
      className="relative isolate flex min-h-[220px] flex-col justify-between gap-5 overflow-hidden rounded-[18px] p-5 text-white shadow-[0_30px_60px_-30px_rgba(20,21,58,0.85)] sm:p-6"
      style={{ background: "linear-gradient(135deg, #26296A 0%, #1F2157 55%, #15163F 100%)" }}>
      {/* Original illustration in the style of the City Bank AMEX debit card: deep navy, a blue star-and-ring line
          pattern that turns slowly, a silver chip, contactless waves and a red accent (card cues only — no logos). */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 h-full w-full" viewBox="0 0 400 250" preserveAspectRatio="xMinYMid slice" fill="none">
        <circle cx="40" cy="125" r="190" stroke="#17184A" strokeWidth="16" />
        <g className="debit-star">
          <polygon points={STAR_A} stroke="#2B45A8" strokeWidth="9" strokeLinejoin="miter" opacity="0.85" />
          <polygon points={STAR_B} stroke="#1E3A8F" strokeWidth="7" opacity="0.7" />
        </g>
        <circle cx="40" cy="125" r="62" stroke="#2B45A8" strokeWidth="8" opacity="0.85" />
      </svg>
      <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 -z-10 h-[180px] w-[260px] rounded-[50%] bg-[radial-gradient(closest-side,rgba(237,28,36,0.28),transparent)]" />
      <svg aria-hidden="true" className="pointer-events-none absolute right-5 top-16 -z-10" width="80" height="36" viewBox="0 0 80 36" fill="none">
        <defs><linearGradient id="dchip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F4F5F7" /><stop offset=".45" stopColor="#C9CDD4" /><stop offset=".7" stopColor="#EEF0F3" /><stop offset="1" stopColor="#9EA3AC" /></linearGradient></defs>
        <rect x="0.5" y="2.5" width="42" height="31" rx="6" fill="url(#dchip)" stroke="#1B1C2E" strokeOpacity=".5" />
        <path d="M0 13h14M28 13h14M0 23h14M28 23h14M14 3c3 4 3 26 0 30M28 3c-3 4-3 26 0 30" stroke="#3A3D4A" strokeOpacity=".55" strokeWidth="1.2" />
        <g stroke="#C9CDD4" strokeWidth="2.6" strokeLinecap="round"><path d="M55 12a8 8 0 0 1 0 12" /><path d="M61 8a14 14 0 0 1 0 20" /><path d="M67 4a20 20 0 0 1 0 28" /></g>
      </svg>

      <div className="flex items-start justify-between gap-3">
        <span className="flex items-start gap-2.5 leading-tight">
          <span aria-hidden="true" className="mt-0.5 h-8 w-[5px] flex-none -skew-x-[18deg] rounded-sm bg-[#ED1C24]" />
          <span>
            <span className="block text-[15px] font-semibold">City Bank AMEX Debit Card</span>
            <span className="block text-[12px] text-white/60">American Express debit card · spending tally</span>
          </span>
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
