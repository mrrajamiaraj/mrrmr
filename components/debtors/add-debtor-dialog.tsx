"use client";

import { useId, useState, useTransition } from "react";
import { Modal, ErrorBox, btnGhost, btnPrimary } from "@/components/modal";
import { addCardUse, addLoan } from "@/lib/actions";
import { addDays, addMonths, dateLong, taka, todayIso } from "@/lib/format";
import { emiPerMonth } from "@/lib/ledger";
import { subMoney } from "@/lib/money";
import { CARD_CATEGORIES, EMI_MONTHS, LOAN_METHODS, type Card, type PayPlan } from "@/lib/types";

type Common = {
  title: string;
  knownNames: string[];
  prefillName?: string;
  /** shows "Currently owes" banner instead of the name field (Debtors page "+ Loan") */
  lockedPerson?: { name: string; initials: string; owes: number };
  submitLabel?: string;
  onClose: () => void;
  onAdded: (personId: string | null, message: string) => void;
};

type Props =
  | (Common & { mode: "loan"; account: { id: string; name: string } | null; extended?: boolean })
  | (Common & { mode: "card"; card: Card });

export function AddDebtorDialog(props: Props) {
  const listId = useId();
  const today = todayIso();
  const isLoan = props.mode === "loan";
  const [f, setF] = useState({
    name: props.lockedPerson?.name ?? props.prefillName ?? "",
    amt: "",
    initial: "",
    date: today,
    why: "",
    how: LOAN_METHODS[0] as string,
    cat: "Shopping",
    due: props.mode === "card" && props.card.pay_by && props.card.pay_by >= today ? props.card.pay_by : addDays(today, 14),
    notes: "",
  });
  const [flag, setFlag] = useState(true); // deduct from account / add to card balance
  // Card only: pay back in full by one date (defaults to the card's own pay-by date), or monthly EMI.
  const fullDue = props.mode === "card" && props.card.pay_by && props.card.pay_by >= today ? props.card.pay_by : addDays(today, 14);
  const [plan, setPlan] = useState<PayPlan>("full");
  const [months, setMonths] = useState<number>(6);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    setError("");
  };

  const isMe = !isLoan && f.name.trim().toLowerCase() === "me";
  const emi = !isLoan && !isMe && plan === "emi";
  const amtNum = Math.round(Number(f.amt) * 100) / 100;
  const perMonth = amtNum > 0 ? emiPerMonth(amtNum, months) : 0;

  function choosePlan(p: PayPlan) {
    setPlan(p);
    setError("");
    // Real cards: the first EMI installment is a month after the purchase; a full payment is due on the card's pay-by date.
    setF((cur) => ({ ...cur, due: p === "emi" ? addMonths(cur.date || today, 1) : fullDue }));
  }

  function save() {
    const name = f.name.trim();
    const amt = Math.round(Number(f.amt) * 100) / 100;
    const err = !name
      ? isLoan ? "Enter who took the money." : "Enter who used the card (or “Me” for your own spending)."
      : !f.amt || !(amt > 0) ? "Enter an amount above 0."
      : !f.why.trim() ? (isLoan ? "Enter why they took it." : "Enter why or where it was used.")
      : isLoan && f.initial && !(Number(f.initial) >= 0 && Number(f.initial) <= amt) ? "Initial repaid must be between 0 and the loan amount."
      : emi && !f.due ? "Pick the first installment date."
      : emi && f.date && f.due < f.date ? "The first installment can't be before the card was used."
      : "";
    if (err) return setError(err);

    start(async () => {
      if (props.mode === "loan") {
        const deduct = flag && !!props.account;
        const r = await addLoan({
          name, amount: amt, reason: f.why, takenOn: f.date, method: f.how, dueOn: f.due,
          accountId: props.account?.id ?? null, deduct,
          initialRepaid: Number(f.initial) || 0, notes: f.notes,
        });
        if (r.error) return setError(r.error);
        props.onAdded(
          r.personId ?? null,
          `${name} added — ${taka(amt)} for ${f.why.trim()}` + (deduct ? `. Taken out of your ${props.account!.name} balance.` : ".")
        );
      } else {
        const r = await addCardUse({
          cardId: props.card.id, name, amount: amt, reason: f.why, usedOn: f.date,
          category: f.cat, dueOn: isMe ? "" : f.due, addToBalance: flag,
          plan: emi ? "emi" : "full", emiMonths: emi ? months : undefined,
        });
        if (r.error) return setError(r.error);
        props.onAdded(
          r.personId ?? null,
          `${isMe ? "Your own spending" : name} added — used ${taka(amt)} for ${f.why.trim()}`
            + (emi ? ` on EMI: ${months} × ${taka(emiPerMonth(amt, months))} a month from ${dateLong(f.due)}` : "")
            + (flag ? ". Added to the card balance." : ".")
        );
      }
    });
  }

  const label = "field-label";
  const input = "field-input";

  return (
    <Modal
      title={props.title}
      onClose={props.onClose}
      maxWidth={props.mode === "loan" && props.extended ? 560 : 580}
      footer={
        <>
          <button type="button" onClick={props.onClose} className={btnGhost}>Cancel</button>
          <button type="button" onClick={save} disabled={pending} className={btnPrimary}>
            {pending ? "Saving…" : props.submitLabel ?? (isMe ? "Add my spending" : "Add debtor & open profile")}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        {props.lockedPerson ? (
          <div className="col-span-full flex items-center gap-2.5 rounded-md border border-good-line bg-good-tint px-3.5 py-2.5">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-good-tint-2 text-[13px] font-semibold text-brand-ink">{props.lockedPerson.initials}</span>
            <div>
              <div className="font-semibold">{props.lockedPerson.name}</div>
              <div className="text-[13px] text-slate-600">Currently owes {taka(props.lockedPerson.owes)}</div>
            </div>
          </div>
        ) : (
          <label className={`${label} col-span-full`}>
            {isLoan ? "Who took the money? *" : "Who used the card? *"}
            <input type="text" list={listId} value={f.name} onChange={set("name")} autoComplete="off"
              placeholder={isLoan ? "e.g. Mamun Vai, Rafi Ahmed…" : "e.g. Rafi Ahmed, Nusrat… or “Me”"}
              className={`${input} border-2 border-brand-2`} />
            <datalist id={listId}>
              {!isLoan && <option value="Me" />}
              {props.knownNames.map((n) => <option key={n} value={n} />)}
            </datalist>
          </label>
        )}

        <label className={label}>
          {isLoan ? "How much? (৳) *" : "How much? (৳) *"}
          <input type="number" min="1" inputMode="decimal" value={f.amt} onChange={set("amt")} placeholder="0" className={`${input} tabular-nums`} />
        </label>
        {props.mode === "loan" && props.extended ? (
          <label className={label}>
            Initial repaid (৳)
            <input type="number" min="0" inputMode="decimal" value={f.initial} onChange={set("initial")} placeholder="0" className={`${input} tabular-nums`} />
          </label>
        ) : (
          <label className={label}>
            {isLoan ? "When did they take it?" : "When was it used?"}
            <input type="date" value={f.date} onChange={set("date")} className={input} />
          </label>
        )}

        <label className={`${label} col-span-full`}>
          {isLoan ? "Why did they take it? *" : "Why / where was it used? *"}
          <input type="text" value={f.why} onChange={set("why")}
            placeholder={isLoan ? "e.g. Medical bills, house rent, semester fee…" : "e.g. Air ticket, Daraz order, restaurant bill…"}
            className={input} />
        </label>

        {props.mode === "loan" && props.extended && (
          <label className={label}>
            Borrowing date
            <input type="date" value={f.date} onChange={set("date")} className={input} />
          </label>
        )}

        {isLoan ? (
          <label className={label}>
            How was it given?
            <select value={f.how} onChange={set("how")} className={`${input} px-3`}>
              {LOAN_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
        ) : (
          <label className={label}>
            Category
            <select value={f.cat} onChange={set("cat")} className={`${input} px-3`}>
              {CARD_CATEGORIES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
        )}

        {!isLoan && !isMe && (
          <div className="col-span-full">
            <div className="field-label" id={`${listId}-plan`}>How will they pay it back?</div>
            <div role="radiogroup" aria-labelledby={`${listId}-plan`} className="mt-1.5 grid grid-cols-2 gap-2">
              {([
                ["full", "Full payment", "All at once, by one date"],
                ["emi", "EMI", "Monthly installments"],
              ] as const).map(([v, title, sub]) => (
                <button key={v} type="button" role="radio" aria-checked={plan === v} onClick={() => choosePlan(v)}
                  className={`min-h-11 rounded-md border px-3 py-2 text-left transition-colors ${
                    plan === v ? "border-brand-2 bg-good-tint" : "border-line bg-surface hover:bg-subtle"}`}>
                  <span className="block text-[14.5px] font-semibold">{title}</span>
                  <span className="block text-[12.5px] text-slate-500">{sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {emi && (
          <label className={label}>
            EMI tenure
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={`${input} px-3`}>
              {EMI_MONTHS.map((m) => <option key={m} value={m}>{m} months</option>)}
            </select>
          </label>
        )}

        {!isMe && (
          <label className={label}>
            {props.mode === "loan" && props.extended ? "Settlement due date" : emi ? "First installment date" : "Pay back by"}
            <input type="date" value={f.due} onChange={set("due")} className={input} />
          </label>
        )}

        {emi && (
          <div className="col-span-full rounded-md border border-line bg-subtle px-3.5 py-2.5 text-[13.5px] text-slate-600">
            {perMonth > 0 && f.due ? (
              <>
                <span className="money text-slate-800">{taka(perMonth)}</span> a month for {months} months
                {" · "}first on <span className="font-medium text-slate-800">{dateLong(f.due)}</span>
                {" · "}last on <span className="font-medium text-slate-800">{dateLong(addMonths(f.due, months - 1))}</span>
              </>
            ) : (
              "Enter the amount and first installment date to see the monthly payment."
            )}
          </div>
        )}

        {props.mode === "loan" && props.extended && !props.lockedPerson && (
          <label className={`${label} col-span-full`}>
            Note (optional)
            <input type="text" value={f.notes} onChange={set("notes")} placeholder="Anything to remember about this person" className={input} />
          </label>
        )}

        {props.mode === "card" && (
          <label className="col-span-full flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md bg-subtle px-3 py-2 text-[14.5px]">
            <input type="checkbox" checked={flag} onChange={() => setFlag(!flag)} className="size-[18px] accent-brand-2" />
            Add this amount to the card balance
          </label>
        )}

        {/* Funding source: a loan reduces the bank balance ONLY when it was paid from the bank account. */}
        {props.mode === "loan" && props.account && (
          <fieldset className="col-span-full m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="field-label mb-1.5">Where did the money come from?</legend>
            {([
              [true, `${props.account.name} account`, `Take ${amtNum > 0 ? taka(amtNum) : "the amount"} out of the ${props.account.name} balance`],
              [false, "Cash on hand / elsewhere", `The ${props.account.name} balance doesn't change`],
            ] as const).map(([v, title, sub]) => (
              <label key={String(v)} className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 ${flag === v ? "border-brand-2 bg-good-tint" : "border-line hover:bg-subtle"}`}>
                <input type="radio" name={`${listId}-src`} checked={flag === v} onChange={() => setFlag(v)} className="mt-0.5 size-[18px] accent-brand-2" />
                <span><span className="block text-[14px] font-medium">{title}</span><span className="block text-[12.5px] text-slate-500">{sub}</span></span>
              </label>
            ))}
            <p className="m-0 text-[12px] text-slate-500">Put it on your credit card instead? Record a <b>card transaction</b> — card money is never a bank loan.</p>
          </fieldset>
        )}

        {props.mode === "loan" && amtNum > 0 && (
          <dl aria-label="What saving changes" className="col-span-full m-0 grid gap-1 rounded-md border border-line bg-surface px-3.5 py-2.5 text-[13px]">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{f.name.trim() || "They"} will owe you</dt><dd className="money m-0 text-owed">+{taka(Math.max(subMoney(amtNum, Number(f.initial) || 0), 0))}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{props.account?.name ?? "Bank"} balance</dt><dd className="m-0">{props.account && flag ? <span className="money text-bad">−{taka(Math.max(subMoney(amtNum, Number(f.initial) || 0), 0))}</span> : "Unchanged"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Pay back by</dt><dd className="m-0">{f.due ? dateLong(f.due) : "No date (can't show as late)"}</dd></div>
          </dl>
        )}

        {error && <ErrorBox className="col-span-full">{error}</ErrorBox>}
      </div>
    </Modal>
  );
}
