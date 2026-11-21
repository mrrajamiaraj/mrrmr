"use client";

import { useState, useTransition } from "react";
import { recordRepayment } from "@/lib/actions";
import { taka, todayIso } from "@/lib/format";
import { subMoney } from "@/lib/money";
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
  // Money only goes into the bank when you say so. Default: yes for a bank transfer, no for cash / bKash / Nagad
  // (owner rule: a cash payment is never silently added to the bank). Your own choice sticks once you touch it.
  const [toAccount, setToAccount] = useState<boolean | null>(null);
  const [toBill, setToBill] = useState(true);
  const [error, setError] = useState("");
  const [dupe, setDupe] = useState(false);
  // One id per submission attempt: retries and double-clicks reuse it (recorded once); a new id after each success.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();
  const target = targets.find((t) => t.key === targetKey) ?? targets[0];
  if (!target) return null;

  const forLoan = target.appliesTo === "loan";
  const intoBank = forLoan && !!account && (toAccount ?? via === "Bank transfer");
  const lowerCard = !forLoan && toBill;
  const n = Math.round(Number(amt) * 100) / 100;
  const valid = !!amt && n > 0 && n <= target.max;

  function save(confirmDuplicate = false) {
    if (!amt || !(n > 0)) return setError("Enter an amount above 0.");
    if (n > target.max)
      return setError(
        `${first} only owes ${taka(target.max)}${mode === "card" ? " for this card" : target.appliesTo === "loan" ? " on loans" : " for that card"}.`
      );
    start(async () => {
      const r = await recordRepayment({
        personId, amount: n, via, paidOn: date,
        appliesTo: target.appliesTo, cardId: target.cardId,
        accountId: intoBank ? account!.id : null, addToAccount: intoBank, lowerCard, confirmDuplicate, requestId,
      });
      if (r.duplicate) { setDupe(true); return setError(r.error ?? "This looks like a repeat."); }
      if (r.error) return setError(r.error);
      setAmt(""); setDupe(false); setToAccount(null); setRequestId(crypto.randomUUID());
      onSaved(
        `${first} paid back ${taka(n)} via ${via}.` +
          (intoBank ? ` Added to your ${account!.name} balance.` : forLoan ? " Not added to the bank." : lowerCard ? " Put toward the card bill." : "")
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
          <input type="number" min="1" inputMode="decimal" value={amt} onChange={(e) => { setAmt(e.target.value); setError(""); }} placeholder="0" className={`${input} tabular-nums`} />
        </label>
        <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-[13px] font-medium text-slate-700">
          Paid via
          <select value={via} onChange={(e) => { setVia(e.target.value); setError(""); setDupe(false); }} className={input}>
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
        <button type="button" onClick={() => save()} disabled={pending} aria-busy={pending || undefined}
          className="min-h-11 rounded-md bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-hover max-sm:w-full sm:min-h-10">
          {pending ? "Saving…" : valid ? `Confirm ${taka(n)}` : "Save repayment"}
        </button>
      </div>
      {forLoan && account && (
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" checked={intoBank} onChange={() => setToAccount(!intoBank)} className="size-[18px] accent-brand-2" />
          Add this money to my {account.name} balance{via !== "Bank transfer" && <span className="text-slate-500"> — off by default for {via}</span>}
        </label>
      )}
      {!forLoan && (
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" checked={toBill} onChange={() => setToBill(!toBill)} className="size-[18px] accent-brand-2" />
          Put this money toward the card bill (lowers the card balance)
        </label>
      )}
      {/* What saving will change — every total that moves, and the allocation rule that decides where it goes. */}
      {valid && (
        <dl aria-label="What this repayment changes" className="m-0 grid gap-1 rounded-lg border border-line bg-surface p-3 text-[13px]">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">{first} owes {forLoan ? "on loans" : "for this card"}</dt><dd className="m-0 money">{taka(target.max)} → {taka(subMoney(target.max, n))}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">{account?.name ?? "Bank"} balance</dt><dd className="m-0">{intoBank ? <span className="money text-brand-2">+{taka(n)}</span> : "Unchanged"}</dd></div>
          {!forLoan && <div className="flex justify-between gap-3"><dt className="text-slate-500">Card balance (what you owe)</dt><dd className="m-0">{lowerCard ? <span className="money text-brand-2">−{taka(n)}</span> : "Unchanged"}</dd></div>}
          <div className="text-[12px] text-slate-500">
            Allocation rule: {forLoan ? "clears the loan with the earliest pay-back date first (no date last; same date → older loan first)." : "clears this card's installments earliest-due first."}
          </div>
        </dl>
      )}
      {error && <ErrorBox className="text-[13.5px]">{error}</ErrorBox>}
      {dupe && (
        <button type="button" onClick={() => save(true)} disabled={pending} className="self-start text-[13.5px] font-medium text-bad underline underline-offset-4">
          It's a separate payment — record it anyway
        </button>
      )}
    </div>
  );
}
