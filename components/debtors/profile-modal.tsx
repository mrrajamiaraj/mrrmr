"use client";

import { useState } from "react";
import { Modal, CloseButton, btnGhost, btnPrimary } from "@/components/modal";
import { ClearHistoryDialog, DeleteButton, DeleteRecordDialog, undoText, type DeleteTarget } from "@/components/delete-record-dialog";
import type { RecordKind } from "@/lib/actions";
import { Avatar, StatusPill } from "@/components/debtors/bits";
import { useViewer } from "@/components/shell";
import { RepayForm, repayTargets, type RepayTarget } from "@/components/debtors/repay-form";
import { dateLong, taka } from "@/lib/format";
import { amountSigned, CARD_NAMES, cardTitle, type CardProfile, type EventKind, type HistoryEvent, type Profile } from "@/lib/ledger";
import type { Card } from "@/lib/types";

const hth = "whitespace-nowrap px-3 py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-slate-500";

/** Avatar inside a ring that fills with how much has been paid back. */
function ProgressAvatar({ initials, pct }: { initials: string; pct: number }) {
  const r = 23, c = 2 * Math.PI * r;
  return (
    <span className="relative grid size-[52px] flex-none place-items-center" title={`${pct}% paid back`}>
      <svg aria-hidden="true" width="52" height="52" viewBox="0 0 52 52" className="absolute inset-0 -rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="#E3E1DA" strokeWidth="3" />
        <circle cx="26" cy="26" r={r} fill="none" stroke="#2E6B52" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pct, 100) / 100)}
          className="transition-[stroke-dashoffset] duration-1000 ease-[var(--ease-out-expo)] [animation:ring_1.1s_var(--ease-out-expo)_backwards]"
          style={{ ["--ring-from" as string]: c }} />
      </svg>
      <Avatar text={initials} size={40} />
    </span>
  );
}

/** Amount colour per kind of record: money out is neutral, money back is green. */
const AMOUNT_COLOR: Record<EventKind, string> = {
  "Took loan": "text-ink",
  "Used my card": "text-ink",
  "Paid back": "text-brand-2",
};

function Stat({ label, value, sub, valueClass = "" }: { label: string; value: string; sub: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-white px-4 py-3">
      <div className="caption">{label}</div>
      <div className={`money text-[19px] ${valueClass}`}>{value}</div>
      <div className="text-[12px] text-slate-500">{sub}</div>
    </div>
  );
}

export function ProfileModal({
  profile: p,
  variant,
  cards,
  account,
  card,
  onClose,
  onMore,
  onSaved,
}: {
  profile: Profile | CardProfile;
  variant: "bank" | "card" | "all";
  cards: Card[];
  account: { id: string; name: string } | null;
  card?: Card;
  onClose: () => void;
  onMore: () => void;
  onSaved: (msg: string) => void;
}) {
  // Bank and card pages each show one money source only; "all" (Debtors, Overview) shows everything.
  const isCard = variant === "card" && !!card;
  const isBank = variant === "bank";
  const scoped = isCard || isBank;
  const viewer = useViewer();
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [clearing, setClearing] = useState(false);
  const bankName = account?.name ?? "the bank account";
  const cardName = isCard ? CARD_NAMES[card!.slot] : "the card";
  const KIND: Record<EventKind, RecordKind> = { "Took loan": "loan", "Used my card": "card_use", "Paid back": "repayment" };

  function askDelete(e: HistoryEvent) {
    const kind = KIND[e.kind];
    const onCard = kind === "card_use" || e.paidFor === "card";
    const place = onCard ? cardName : bankName;
    setDeleting({
      kind, id: e.id, amount: e.amount, iso: e.iso,
      what: `${p.name} — ${e.kind.toLowerCase()} · ${e.detail}`,
      undo: undoText(kind, e.amount, place, e.paidFor),
    });
  }

  // Shown instead of the profile so only one dialog is open; Cancel returns to the profile.
  if (deleting) {
    return (
      <DeleteRecordDialog target={deleting} onClose={() => setDeleting(null)}
        onDone={(text) => { setDeleting(null); onSaved(text); }} />
    );
  }
  if (clearing) {
    return (
      <ClearHistoryDialog name={p.name} records={p.events.map((e) => ({ kind: KIND[e.kind], id: e.id }))}
        onClose={() => setClearing(false)}
        onDone={(text) => { setClearing(false); onSaved(text); }} />
    );
  }

  const targets: RepayTarget[] = isCard
    ? [{ key: card!.id, label: "This card", appliesTo: "card", cardId: card!.id, max: p.owes }]
    : isBank
      ? [{ key: "loan", label: "Loan", appliesTo: "loan", cardId: null, max: p.owes }]
      : repayTargets(p, cards);

  return (
    <Modal
      title={p.name}
      onClose={onClose}
      maxWidth={760}
      header={(id) => (
        <div className="flex items-center gap-3 border-b border-line py-3 pl-4 pr-2 sm:pl-5">
          <ProgressAvatar initials={p.initials} pct={p.pct} />
          <div className="min-w-0 flex-auto">
            <h2 id={id} className="m-0 text-[18px] font-semibold leading-tight">{p.name}</h2>
            <div className="text-[13px] text-slate-500">
              {isCard ? cardTitle(card!) : isBank && account ? account.name : "All records"} · {p.dueText}
            </div>
            <div className="mt-0.5 sm:hidden"><StatusPill status={p.status} /></div>
          </div>
          <div className="hidden sm:block"><StatusPill status={p.status} /></div>
          <CloseButton onClick={onClose} label="Close profile" />
        </div>
      )}
      footer={
        <>
          {!viewer && (
            <button type="button" onClick={onMore} className={btnGhost}>
              {isCard ? `Add another use by ${p.first}` : `Lend more to ${p.first}`}
            </button>
          )}
          <button type="button" onClick={onClose} className={btnPrimary}>Done</button>
        </>
      }
    >
      <div className="flex flex-col gap-5 p-4 sm:p-5">
        {/* Hairlines come from the 1px gap over a line-coloured background, so they stay right however the grid wraps. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-px overflow-hidden rounded-xl border border-line bg-line">
          {scoped ? (
            <>
              <Stat label={isCard ? "Used this card" : "Borrowed"} value={taka((p as CardProfile).used)} sub={`${(p as CardProfile).useCount} times`} />
              <Stat label="Paid back" value={taka(p.paid)} sub={`${p.payCount} payments · ${p.pct}%`} valueClass="text-brand-2" />
              <Stat label="Still owes" value={taka(p.owes)} sub={`of ${taka((p as CardProfile).used)}`} valueClass="text-[#85570F]" />
            </>
          ) : (
            <>
              <Stat label="Loans" value={taka(p.loanTotal)} sub={`${p.loanCount} times`} />
              <Stat label="Card use" value={taka(p.cardTotal)} sub={`${p.cardCount} times`} />
              <Stat label="Paid back" value={taka(p.paid)} sub={`${p.payCount} payments · ${p.pct}%`} valueClass="text-brand-2" />
              <Stat label="Still owes" value={taka(p.owes)} sub={`of ${taka(p.taken)}`} valueClass="text-[#85570F]" />
            </>
          )}
        </div>

        {(p.reasons.length > 0 || p.relation || p.phone || p.notes) && (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13.5px]">
            {p.reasons.length > 0 && (
              <><dt className="text-slate-500">{isCard ? "Used for" : "Reasons"}</dt><dd className="m-0">{p.reasons.join(", ")}</dd></>
            )}
            {(p.relation || p.phone || p.notes) && (
              <><dt className="text-slate-500">About</dt><dd className="m-0">{[p.relation, p.phone, p.notes].filter(Boolean).join(" · ")}</dd></>
            )}
          </dl>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="m-0 text-[14.5px] font-semibold">History</h3>
            {p.events.length > 0 && !viewer && (
              <button type="button" onClick={() => setClearing(true)}
                className="min-h-8 rounded-md px-2 text-[13px] text-[#9B3426] hover:bg-[#F8ECE9]">
                Clear history
              </button>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="stack-table w-full min-w-[620px] border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-line bg-[#FAF9F6] text-left">
                  <th scope="col" className={hth}>Date</th>
                  <th scope="col" className={hth}>Type</th>
                  <th scope="col" className={hth}>Details</th>
                  <th scope="col" className={`${hth} text-right`}>Amount</th>
                  <th scope="col" className={`${hth} text-right`}>Owes after</th>
                  <th scope="col" className="px-1"><span className="sr-only">Delete</span></th>
                </tr>
              </thead>
              <tbody>
                {p.events.map((e) => {
                  return (
                    <tr key={e.id} className="border-b border-soft last:border-0">
                      <td data-label="Date" className="whitespace-nowrap px-3 py-2 text-slate-600">{dateLong(e.iso)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{e.kind}</td>
                      <td data-label="Details" className="px-3 py-2 text-slate-600">{e.detail}</td>
                      <td data-label="Amount" className={`money whitespace-nowrap px-3 py-2 text-right ${AMOUNT_COLOR[e.kind]}`}>{amountSigned(e.sign, e.amount)}</td>
                      <td data-label="Owes after" className="money whitespace-nowrap px-3 py-2 text-right text-slate-600">{taka(e.owesAfter)}</td>
                      <td className="stack-corner px-1 text-right">
                        <DeleteButton label={`Delete ${e.kind.toLowerCase()} of ${taka(e.amount)} on ${dateLong(e.iso)}`} onClick={() => askDelete(e)} />
                      </td>
                    </tr>
                  );
                })}
                {p.events.length === 0 && (
                  <tr><td colSpan={6}className="px-3 py-4 text-center text-slate-500">No records yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {p.owes > 0 && targets.length > 0 && !viewer && (
          <RepayForm
            key={p.id + p.owes}
            personId={p.id}
            first={p.first}
            targets={targets}
            mode={variant}
            account={account}
            withDate={variant === "all"}
            onSaved={onSaved}
          />
        )}
      </div>
    </Modal>
  );
}
