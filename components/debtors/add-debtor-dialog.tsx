"use client";

import { useId, useState, useTransition } from "react";
import { Modal, ErrorBox, btnGhost, btnPrimary } from "@/components/modal";
import { addCardUse, addLoan } from "@/lib/actions";
import { addDays, taka, todayIso } from "@/lib/format";
import { CARD_CATEGORIES, LOAN_METHODS, type Card } from "@/lib/types";

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
    due: addDays(today, 14),
    notes: "",
  });
  const [flag, setFlag] = useState(true); // deduct from account / add to card balance
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    setError("");
  };

  const isMe = !isLoan && f.name.trim().toLowerCase() === "me";

  function save() {
    const name = f.name.trim();
    const amt = Math.round(Number(f.amt) * 100) / 100;
    const err = !name
      ? isLoan ? "Enter who took the money." : "Enter who used the card (or “Me” for your own spending)."
      : !f.amt || !(amt > 0) ? "Enter an amount above 0."
      : !f.why.trim() ? (isLoan ? "Enter why they took it." : "Enter why or where it was used.")
      : isLoan && f.initial && !(Number(f.initial) >= 0 && Number(f.initial) <= amt) ? "Initial repaid must be between 0 and the loan amount."
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
        });
        if (r.error) return setError(r.error);
        props.onAdded(
          r.personId ?? null,
          `${isMe ? "Your own spending" : name} added — used ${taka(amt)} for ${f.why.trim()}` + (flag ? ". Added to the card balance." : ".")
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
          <div className="col-span-full flex items-center gap-2.5 rounded-md border border-[#CADBD0] bg-[#F2F6F3] px-3.5 py-2.5">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#E3ECE6] text-[13px] font-semibold text-[#1F4D3A]">{props.lockedPerson.initials}</span>
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
              className={`${input} border-2 border-[#3D7D61]`} />
            <datalist id={listId}>
              {!isLoan && <option value="Me" />}
              {props.knownNames.map((n) => <option key={n} value={n} />)}
            </datalist>
          </label>
        )}

        <label className={label}>
          {isLoan ? "How much? (৳) *" : "How much? (৳) *"}
          <input type="number" min="1" inputMode="decimal" value={f.amt} onChange={set("amt")} placeholder="0" className={`${input} font-mono`} />
        </label>
        {props.mode === "loan" && props.extended ? (
          <label className={label}>
            Initial repaid (৳)
            <input type="number" min="0" inputMode="decimal" value={f.initial} onChange={set("initial")} placeholder="0" className={`${input} font-mono`} />
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

        {!isMe && (
          <label className={label}>
            {props.mode === "loan" && props.extended ? "Settlement due date" : "Pay back by"}
            <input type="date" value={f.due} onChange={set("due")} className={input} />
          </label>
        )}

        {props.mode === "loan" && props.extended && !props.lockedPerson && (
          <label className={`${label} col-span-full`}>
            Note (optional)
            <input type="text" value={f.notes} onChange={set("notes")} placeholder="Anything to remember about this person" className={input} />
          </label>
        )}

        {(props.mode === "card" || props.account) && (
          <label className="col-span-full flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md bg-[#FAF9F6] px-3 py-2 text-[14.5px]">
            <input type="checkbox" checked={flag} onChange={() => setFlag(!flag)} className="size-[18px] accent-brand-2" />
            {props.mode === "loan" ? `Take this amount out of my ${props.account!.name} balance` : "Add this amount to the card balance"}
          </label>
        )}

        {error && <ErrorBox className="col-span-full">{error}</ErrorBox>}
      </div>
    </Modal>
  );
}
