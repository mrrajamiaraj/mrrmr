"use client";

import { useState, useTransition } from "react";
import { recordRepayment } from "@/lib/actions";
import { taka, todayIso } from "@/lib/format";
import { cardLabel } from "@/lib/ledger";
import { REPAY_VIA, type Card } from "@/lib/types";
import { ErrorBox } from "@/components/modal";

export type RepayTarget = { key: string; label: string; appliesTo: "loan" | "card"; cardId: string | null; max: number };

/** Where a repayment can go for a person, loans first then each card with something outstanding. */
export function repayTargets(p: { loanOut: number; cardOutByCard: Record<string, number> }, cards: Card[]): RepayTarget[] {
  const t: RepayTarget[] = [];
  if (p.loanOut > 0) t.push({ key: "loan", label: "Loan", appliesTo: "loan", cardId: null, max: p.loanOut });
  for (const c of cards) {
    const out = p.cardOutByCard[c.id];
    if (out > 0) t.push({ key: c.id, label: `Card use — ${cardLabel(c)}`, appliesTo: "card", cardId: c.id, max: out });
  }
  return t;
}

/**
 * Record a repayment.
 *  - bank: goes into the account balance
 *  - card: for this card only; optionally lowers the card balance
 *  - all:  Debtors page; optionally goes into the account balance
 */
export function RepayForm({
  personId,
  first,
  targets,
  mode,
  account,
  withDate = false,
  onSaved,
}: {
  personId: string;
  first: string;
  targets: RepayTarget[];
  mode: "bank" | "card" | "all";
  account: { id: string; name: string } | null;
  withDate?: boolean;
  onSaved: (msg: string) => void;
}) {
  const [amt, setAmt] = useState("");
  const [via, setVia] = useState<string>("Bank transfer");
  const [date, setDate] = useState(todayIso());
  const [targetKey, setTargetKey] = useState(targets[0]?.key ?? "");
  const [toAccount, setToAccount] = useState(true);
  const [toBill, setToBill] = useState(true);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const target = targets.find((t) => t.key === targetKey) ?? targets[0];
  if (!target) return null;

  function save() {
    const n = Math.round(Number(amt) * 100) / 100;
    if (!amt || !(n > 0)) return setError("Enter an amount above 0.");
    if (n > target.max)
      return setError(
        `${first} only owes ${taka(target.max)}${mode === "card" ? " for this card" : target.appliesTo === "loan" ? " on loans" : " for that card"}.`
      );
    // Bank and cards are kept separate: loan repayments can go into the bank,
    // card repayments can only lower that card's balance.
    const forLoan = target.appliesTo === "loan";
    const addToAccount = forLoan && !!account && (mode === "bank" || (mode === "all" && toAccount));
    const lowerCard = !forLoan && (mode === "card" || mode === "all") && toBill;
    start(async () => {
      const r = await recordRepayment({
        personId, amount: n, via, paidOn: date,
        appliesTo: target.appliesTo, cardId: target.cardId,
        accountId: addToAccount ? account!.id : null, addToAccount, lowerCard,
      });
      if (r.error) return setError(r.error);
      setAmt("");
      onSaved(
        `${first} paid back ${taka(n)}.` +
          (addToAccount ? ` Added to your ${account!.name} balance.` : lowerCard ? " Put toward the card bill." : "")
      );
    });
  }

  const input = "min-h-10 rounded-md border border-line-strong bg-surface px-3 text-[14px] font-normal";

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-subtle p-4">
      <div className="text-[14.5px] font-semibold">Record a repayment from {first}</div>
      <div className="flex flex-wrap items-end gap-2.5">
        <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-[13px] font-medium text-slate-700">
          Amount (৳)
          <input type="number" min="1" inputMode="decimal" value={amt} onChange={(e) => { setAmt(e.target.value); setError(""); }} placeholder="0" className={`${input} font-mono`} />
        </label>
        <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-[13px] font-medium text-slate-700">
          Paid via
          <select value={via} onChange={(e) => setVia(e.target.value)} className={input}>
            {REPAY_VIA.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        {withDate && (
          <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-[13px] font-medium text-slate-700">
            Date received
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>
        )}
        {targets.length > 1 && (
          <label className="flex flex-[1_1_200px] flex-col gap-1.5 text-[13px] font-medium text-slate-700">
            For
            <select value={target.key} onChange={(e) => { setTargetKey(e.target.value); setError(""); }} className={input}>
              {targets.map((t) => <option key={t.key} value={t.key}>{t.label} ({taka(t.max)})</option>)}
            </select>
          </label>
        )}
        <button type="button" onClick={save} disabled={pending} className="min-h-10 rounded-md bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-hover">
          {pending ? "Saving…" : "Save repayment"}
        </button>
      </div>
      {mode === "bank" && account && <div className="text-[13px] text-slate-600">The amount is added to your {account.name} balance.</div>}
      {mode === "all" && account && target.appliesTo === "loan" && (
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" checked={toAccount} onChange={() => setToAccount(!toAccount)} className="size-[18px] accent-brand-2" />
          Add this money to my {account.name} balance
        </label>
      )}
      {(mode === "card" || (mode === "all" && target.appliesTo === "card")) && (
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" checked={toBill} onChange={() => setToBill(!toBill)} className="size-[18px] accent-brand-2" />
          Put this money toward the card bill (lowers the card balance)
        </label>
      )}
      {error && <ErrorBox className="text-[13.5px]">{error}</ErrorBox>}
    </div>
  );
}
