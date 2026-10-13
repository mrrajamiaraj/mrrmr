"use client";

import { Modal, CloseButton } from "@/components/modal";
import { Avatar, StatusPill } from "@/components/debtors/bits";
import { RepayForm, repayTargets, type RepayTarget } from "@/components/debtors/repay-form";
import { dateLong, taka } from "@/lib/format";
import { amountSigned, cardTitle, type CardProfile, type EventKind, type Profile } from "@/lib/ledger";
import type { Card } from "@/lib/types";

const CHIP: Record<EventKind, [string, string, string]> = {
  "Took loan": ["#FEF3C7", "#92400E", "#B45309"],
  "Used my card": ["#DBEAFE", "#1D4ED8", "#1D4ED8"],
  "Paid back": ["#CCFBF1", "#115E59", "#0F766E"],
};

function Stat({ label, value, sub, line, warn = false, valueClass = "" }: {
  label: string; value: string; sub: string; line: string; warn?: boolean; valueClass?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${warn ? "border-[#FDE68A] bg-[#FFFBEB]" : "border-line bg-[#F8FAFC]"}`}
      style={{ borderBottom: `3px solid ${line}` }}
    >
      <div className={`text-xs font-semibold tracking-[0.06em] ${warn ? "text-[#92400E]" : "text-slate-600"}`}>{label}</div>
      <div className={`money text-lg ${valueClass}`}>{value}</div>
      <div className={`text-[12.5px] ${warn ? "text-[#92400E]" : "text-slate-500"}`}>{sub}</div>
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
        <div className="flex items-center gap-3.5 bg-[linear-gradient(100deg,#0F5A50_0%,#0B3D38_100%)] px-5 py-[18px] text-white">
          <Avatar text={p.initials} size={52} />
          <div className="min-w-0 flex-auto">
            <h2 id={id} className="m-0 text-[22px] font-bold">{p.name}</h2>
            <div className="text-sm text-mint">
              Debtor profile{isCard ? ` · ${cardTitle(card!)}` : isBank && account ? ` · ${account.name}` : ""} · {p.dueText}
            </div>
          </div>
          <StatusPill status={p.status} className="px-3 py-1 text-[13px]" />
          <CloseButton onClick={onClose} label="Close profile" />
        </div>
      )}
      footer={
        <>
          <button type="button" onClick={onMore} className="min-h-11 rounded-[10px] border border-[#C7D2FE] bg-[#EEF2FF] px-4 text-[15px] font-semibold text-[#3730A3]">
            {isCard ? `+ Add another use by ${p.first}` : `+ Lend more to ${p.first}`}
          </button>
          <button type="button" onClick={onClose} className="min-h-11 rounded-[10px] bg-brand px-5 text-[15px] font-semibold text-white">Done</button>
        </>
      }
    >
      <div className="flex flex-col gap-[18px] p-5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
          {scoped ? (
            <>
              <Stat label={isCard ? "USED THIS CARD" : "TOOK AS LOANS"} value={taka((p as CardProfile).used)} sub={`${(p as CardProfile).useCount} times`} line={isCard ? "#3B82F6" : "#6366F1"} />
              <Stat label="PAID BACK" value={taka(p.paid)} sub={`${p.payCount} payments`} line="#14B8A6" valueClass="text-brand-2" />
              <Stat label="STILL OWES" value={taka(p.owes)} sub={`of ${taka((p as CardProfile).used)} ${isCard ? "used" : "taken"}`} line="#F59E0B" warn valueClass="text-[#92400E]" />
            </>
          ) : (
            <>
              <Stat label="TOOK AS LOANS" value={taka(p.loanTotal)} sub={`${p.loanCount} times`} line="#6366F1" />
              <Stat label="USED MY CARDS" value={taka(p.cardTotal)} sub={`${p.cardCount} times`} line="#3B82F6" />
              <Stat label="PAID BACK" value={taka(p.paid)} sub={`${p.payCount} payments`} line="#14B8A6" valueClass="text-brand-2" />
              <Stat label="STILL OWES" value={taka(p.owes)} sub={`of ${taka(p.taken)} total taken`} line="#F59E0B" warn valueClass="text-[#92400E]" />
            </>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm"><span>Paid back so far</span><span className="font-mono">{p.pct}%</span></div>
          <div className="h-2 overflow-hidden rounded bg-soft"><div className="h-full bg-[#14B8A6]" style={{ width: `${Math.min(p.pct, 100)}%` }} /></div>
        </div>

        {p.reasons.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12.5px] font-semibold tracking-[0.06em] text-slate-600">{isCard ? "USED FOR" : "REASONS"}</span>
            {p.reasons.map((r, i) => (
              <span key={i} className="rounded-md border border-[#E2E8F0] bg-soft px-2 py-0.5 text-[13px]">#{r}</span>
            ))}
          </div>
        )}

        {(p.relation || p.phone || p.notes) && (
          <div className="text-sm text-slate-600">
            {[p.relation, p.phone, p.notes].filter(Boolean).join(" · ")}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-[15px] font-bold uppercase tracking-[0.04em]">Full history</h3>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-[#F8FAFC] text-left">
                  <th scope="col" className="px-3 py-2.5 font-semibold">Date</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">What happened</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Details</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Amount</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Owes after</th>
                </tr>
              </thead>
              <tbody>
                {p.events.map((e) => {
                  const c = CHIP[e.kind];
                  return (
                    <tr key={e.id} className="border-b border-soft">
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{dateLong(e.iso)}</td>
                      <td className="px-3 py-2.5">
                        <span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12.5px] font-semibold" style={{ background: c[0], color: c[1] }}>{e.kind}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{e.detail}</td>
                      <td className="money whitespace-nowrap px-3 py-2.5 text-right" style={{ color: c[2] }}>{amountSigned(e.sign, e.amount)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono">{taka(e.owesAfter)}</td>
                    </tr>
                  );
                })}
                {p.events.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-500">No records yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {p.owes > 0 && targets.length > 0 && (
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
