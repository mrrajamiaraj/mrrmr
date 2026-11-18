"use client";

// Guided card purchase: card → purchase → who pays (split) → plan per payer → review every effect → save.
// Saved in ONE transaction by addCardPurchase (add_card_purchase, migration 0010; single-payer fallback before it).
// The review is computed with the same exact helpers the ledger uses (lib/money), and says explicitly that the bank
// balance is not touched: card purchases are card liabilities, never bank movements.

import { useId, useMemo, useState, useTransition } from "react";
import { Modal, ErrorBox } from "@/components/modal";
import { Badge, Button, Money } from "@/components/ui";
import { CardIcon, CheckIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { addCardPurchase, type PurchasePart } from "@/lib/actions";
import { addDays, addMonths, dateLong, taka, takaExact, todayIso } from "@/lib/format";
import { cardLabel } from "@/lib/ledger";
import { fromPaisa, roundMoney, splitInstallments, subMoney, sumBy, toPaisa } from "@/lib/money";
import { CARD_CATEGORIES, EMI_MONTHS, type Card, type PayPlan } from "@/lib/types";

type Row = { key: number; name: string; amount: string; plan: PayPlan; months: number; due: string; charges: string };
const STEPS = ["Card", "Purchase", "Who pays", "Plan", "Review"] as const;

export function CardPurchaseDialog({ cards, initialCardId, knownNames, onClose, onSaved, initialPayer = "" }: {
  cards: Card[]; initialCardId?: string; knownNames: string[]; initialPayer?: string;
  onClose: () => void; onSaved: (message: string, personId: string | null) => void;
}) {
  const today = todayIso();
  const listId = useId();
  const [step, setStep] = useState(initialCardId ? 1 : 0);
  const [cardId, setCardId] = useState(initialCardId ?? cards[0]?.id ?? "");
  const card = cards.find((c) => c.id === cardId)!;
  const defaultDue = (c: Card) => (c.pay_by && c.pay_by >= today ? c.pay_by : addDays(today, 14));
  const [f, setF] = useState({ amount: "", date: today, reason: "", category: "Shopping", addToBalance: true });
  const nextKey = useState(() => ({ n: 2 }))[0];
  const [rows, setRows] = useState<Row[]>([{ key: 1, name: initialPayer, amount: "", plan: "full", months: 6, due: defaultDue(card), charges: "" }]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const total = roundMoney(f.amount);
  const totalOk = total > 0;
  const allocatedP = rows.reduce((t, r) => t + (toPaisa(r.amount) || 0), 0);
  const remaining = totalOk ? fromPaisa(toPaisa(total) - allocatedP) : 0;
  const single = rows.length === 1;
  const isMe = (r: Row) => r.name.trim().toLowerCase() === "me";
  // One payer: their share is the whole purchase (no need to type it twice).
  const shareOf = (r: Row) => (single ? total : roundMoney(r.amount));

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
    setError("");
  };
  const setRow = (key: number, patch: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); setError(""); };
  const addRow = () => setRows((rs) => [...rs, { key: nextKey.n++, name: "", amount: "", plan: "full", months: 6, due: defaultDue(card), charges: "" }]);
  const splitEqually = () => {
    if (!totalOk) return;
    const parts = splitInstallments(total, rows.length);
    setRows((rs) => rs.map((r, i) => ({ ...r, amount: String(parts[i]) })));
  };

  /** Validation for the step being left; returns an error message or "". */
  function check(s: number): string {
    if (s === 0 && !card) return "Pick a card.";
    if (s === 1) {
      if (!totalOk) return "Enter the purchase amount (above ৳0).";
      if (!f.reason.trim()) return "Enter why or where the card was used.";
      if (!f.date) return "Enter the purchase date.";
    }
    if (s === 2) {
      const names = rows.map((r) => r.name.trim().toLowerCase());
      if (names.some((n) => !n)) return "Enter who pays each share (type “Me” for your own share).";
      if (new Set(names).size !== names.length) return "The same person appears twice — combine their shares.";
      if (!single) {
        if (rows.some((r) => !(roundMoney(r.amount) > 0))) return "Every share must be above ৳0.";
        if (toPaisa(remaining) !== 0) return remaining > 0 ? `${taka(remaining)} of the purchase isn't assigned yet.` : `Shares are ${taka(-remaining)} more than the purchase.`;
      }
    }
    if (s === 3) {
      for (const r of rows.filter((x) => !isMe(x))) {
        if (!r.due) return `Pick ${r.plan === "emi" ? "the first installment date" : "the pay-back date"} for ${r.name.trim()}.`;
        if (r.plan === "emi" && r.due < f.date) return `${r.name.trim()}'s first installment can't be before the purchase date.`;
        if (r.plan === "emi" && r.charges && !(roundMoney(r.charges) >= 0)) return "EMI charges must be 0 or more.";
      }
    }
    return "";
  }
  const next = () => { const e = check(step); if (e) return setError(e); setError(""); setStep((s) => Math.min(s + 1, 4)); };
  const back = () => { setError(""); setStep((s) => Math.max(s - 1, 0)); };

  // ---- review figures (display only; the database applies the real change) ----
  const review = useMemo(() => {
    if (!card || !totalOk) return null;
    const people = rows.filter((r) => !isMe(r)).map((r) => {
      const share = shareOf(r);
      const emi = r.plan === "emi";
      const charges = emi ? roundMoney(r.charges || 0) || 0 : 0;
      const owed = sumBy([share, charges], (x) => x);
      const sched = emi ? splitInstallments(owed, r.months) : [];
      return { r, share, charges, owed, emi, sched, last: emi ? addMonths(r.due, r.months - 1) : r.due };
    });
    const mine = rows.filter(isMe).reduce((t, r) => sumBy([t, shareOf(r)], (x) => x), 0);
    const newBalance = f.addToBalance ? sumBy([card.balance, total], (x) => x) : card.balance;
    const availBefore = card.credit_limit != null ? Math.max(subMoney(card.credit_limit, card.balance), 0) : null;
    const availAfter = card.credit_limit != null ? Math.max(subMoney(card.credit_limit, newBalance), 0) : null;
    return { people, mine, newBalance, availBefore, availAfter, over: card.credit_limit != null && newBalance > card.credit_limit };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, rows, f, total, totalOk]);

  function save() {
    const parts: PurchasePart[] = rows.map((r) => ({
      name: r.name.trim(), amount: shareOf(r), plan: isMe(r) ? "full" : r.plan,
      emiMonths: r.plan === "emi" ? r.months : undefined, dueOn: isMe(r) ? "" : r.due,
      emiCharges: r.plan === "emi" ? roundMoney(r.charges || 0) || 0 : 0,
    }));
    start(async () => {
      const res = await addCardPurchase({ cardId, reason: f.reason, usedOn: f.date, category: f.category, addToBalance: f.addToBalance, parts });
      if (res.error) return setError(res.error);
      const who = rows.map((r) => (isMe(r) ? "you" : r.name.trim())).join(" and ");
      onSaved(`${taka(total)} on ${cardLabel(card)} recorded for ${who}.${f.addToBalance ? " Added to the card balance." : ""}`, res.personId ?? null);
    });
  }

  const label = "field-label";
  const input = "field-input";

  return (
    <Modal title="Card transaction" onClose={onClose} maxWidth={620}
      footer={<>
        {step > 0 && <Button variant="ghost" onClick={back} className="mr-auto">Back</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {step < 4
          ? <Button onClick={next}>Continue</Button>
          : <Button onClick={save} pending={pending} pendingLabel="Saving…"><CheckIcon size={15} />Confirm & save</Button>}
      </>}>
      <div className="flex flex-col gap-4 p-5">
        <ol aria-label="Steps" className="m-0 flex list-none gap-1 p-0">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined} className="flex min-w-0 flex-1 flex-col gap-1">
              <span aria-hidden="true" className={`h-1 rounded-full ${i < step ? "bg-brand-2" : i === step ? "bg-ink" : "bg-line"}`} />
              <span className={`truncate text-[11.5px] ${i === step ? "font-semibold text-ink" : "text-slate-500"}`}>{i + 1}. {s}</span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-[14px] font-semibold">Which card was used?</legend>
            {cards.map((c) => (
              <label key={c.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${cardId === c.id ? "border-brand-2 bg-good-tint" : "border-line bg-surface hover:border-line-strong"}`}>
                <input type="radio" name="card" checked={cardId === c.id} onChange={() => { setCardId(c.id); setRows((rs) => rs.map((r) => ({ ...r, due: defaultDue(c) }))); }} className="size-[18px] accent-brand-2" />
                <span aria-hidden="true" className={`h-8 w-12 flex-none rounded-md ${c.slot === 1 ? "bg-[linear-gradient(135deg,#16705A,#072E25)]" : "bg-[linear-gradient(135deg,#3A3833,#121110)]"}`} />
                <span className="min-w-0 flex-auto">
                  <span className="block text-[14px] font-medium">{cardLabel(c)}</span>
                  <span className="block text-[12.5px] text-slate-500">Owed on card <Money value={c.balance} />{c.credit_limit != null && <> · available <Money value={Math.max(subMoney(c.credit_limit, c.balance), 0)} tone="good" /></>}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2 text-[13px] text-slate-500"><CardIcon size={15} />{cardLabel(card)}</div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className={label}>Purchase amount (৳) *
                <input type="number" inputMode="decimal" min="0" step="0.01" value={f.amount} onChange={set("amount")} placeholder="0" className={`${input} tabular-nums`} data-autofocus />
              </label>
              <label className={label}>Date *
                <input type="date" value={f.date} max={today} onChange={set("date")} className={input} />
              </label>
            </div>
            <label className={label}>Why / where *
              <input value={f.reason} onChange={set("reason")} placeholder="e.g. Daraz order, restaurant bill, air ticket" className={input} maxLength={500} />
            </label>
            <label className={label}>Category
              <select value={f.category} onChange={set("category")} className={input}>{CARD_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-subtle p-3 text-[14px]">
              <input type="checkbox" checked={f.addToBalance} onChange={set("addToBalance")} className="mt-0.5 size-[18px] accent-brand-2" />
              <span>Add this amount to the card balance<span className="block text-[12.5px] text-slate-500">Untick only if the card balance you entered already includes it.</span></span>
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[13.5px] text-slate-500">Who is responsible for paying this? Type <b className="text-ink">Me</b> for your own share. Split it between several people if needed.</p>
            <datalist id={listId}><option value="Me" />{knownNames.map((n) => <option key={n} value={n} />)}</datalist>
            {rows.map((r, i) => (
              <div key={r.key} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
                <label className={`${label} min-w-[160px] flex-[2_1_180px]`}>{single ? "Who pays" : `Payer ${i + 1}`}
                  <input list={listId} value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} placeholder="Name or “Me”" className={input} autoComplete="off" />
                </label>
                {!single && (
                  <label className={`${label} min-w-[120px] flex-[1_1_120px]`}>Share (৳)
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={r.amount} onChange={(e) => setRow(r.key, { amount: e.target.value })} className={`${input} tabular-nums`} />
                  </label>
                )}
                {!single && (
                  <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove payer ${i + 1}`}
                    className="grid size-11 place-items-center rounded-lg text-slate-500 hover:bg-bad-tint hover:text-bad"><TrashIcon size={16} /></button>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              {rows.length < 10 && <Button variant="secondary" size="sm" onClick={addRow}><PlusIcon size={14} />{single ? "Split between people" : "Add payer"}</Button>}
              {!single && <Button variant="ghost" size="sm" onClick={splitEqually}>Split equally</Button>}
              {!single && (
                <span role="status" className={`ml-auto text-[13px] ${toPaisa(remaining) === 0 ? "text-brand-2" : "text-owed"}`}>
                  {toPaisa(remaining) === 0 ? "✓ Fully assigned" : remaining > 0 ? `${taka(remaining)} left to assign` : `${taka(-remaining)} over`} · of <Money value={total} />
                </span>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            {rows.map((r) => isMe(r) ? (
              <div key={r.key} className="rounded-xl border border-line bg-subtle p-3 text-[13.5px]">
                <b>Your share</b> <Money value={shareOf(r)} /> — part of the card balance you pay yourself. Not a receivable.
              </div>
            ) : (
              <fieldset key={r.key} className="m-0 flex flex-col gap-3 rounded-xl border border-line p-3">
                <legend className="px-1 text-[14px] font-semibold">{r.name.trim()} · <Money value={shareOf(r)} /></legend>
                <div role="radiogroup" aria-label={`How ${r.name.trim()} pays back`} className="grid grid-cols-2 gap-2">
                  {(["full", "emi"] as PayPlan[]).map((p) => (
                    <label key={p} className={`flex cursor-pointer flex-col rounded-lg border p-2.5 ${r.plan === p ? "border-brand-2 bg-good-tint" : "border-line hover:border-line-strong"}`}>
                      <span className="flex items-center gap-2 text-[14px] font-medium">
                        <input type="radio" checked={r.plan === p} onChange={() => setRow(r.key, { plan: p, due: p === "emi" ? addMonths(f.date || today, 1) : defaultDue(card) })} className="size-4 accent-brand-2" />
                        {p === "full" ? "Full payment" : "EMI"}
                      </span>
                      <span className="pl-6 text-[12px] text-slate-500">{p === "full" ? "All at once, by one date" : "Monthly installments"}</span>
                    </label>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {r.plan === "emi" && (
                    <label className={label}>Months
                      <select value={r.months} onChange={(e) => setRow(r.key, { months: Number(e.target.value) })} className={input}>
                        {EMI_MONTHS.map((m) => <option key={m} value={m}>{m} months</option>)}
                      </select>
                    </label>
                  )}
                  <label className={label}>{r.plan === "emi" ? "First installment" : "Pay back by"}
                    <input type="date" value={r.due} onChange={(e) => setRow(r.key, { due: e.target.value })} className={input} />
                  </label>
                  {r.plan === "emi" && (
                    <label className={label}>EMI charges (৳)
                      <input type="number" inputMode="decimal" min="0" step="0.01" value={r.charges} onChange={(e) => setRow(r.key, { charges: e.target.value })} placeholder="0" className={`${input} tabular-nums`} />
                    </label>
                  )}
                </div>
                {r.plan === "emi" && (
                  <p className="m-0 text-[12px] text-slate-500">
                    Charges: only interest or fees shown on your card statement for this EMI — leave empty if none. {r.name.trim()} owes them on top of the purchase, spread over the installments.
                  </p>
                )}
              </fieldset>
            ))}
          </div>
        )}

        {step === 4 && review && (
          <div className="flex flex-col gap-3 text-[13.5px]">
            <h3 className="m-0 text-[15px] font-semibold">Review — this is everything that will change</h3>
            <dl className="m-0 grid gap-px overflow-hidden rounded-xl border border-line bg-line">
              <Effect term={`${cardLabel(card)} balance`} badge="Liability">
                {f.addToBalance ? <><Money value={card.balance} tone="muted" /> → <Money value={review.newBalance} tone="bad" /> <span className="text-slate-500">(+{taka(total)})</span></> : <span>Unchanged (not added)</span>}
              </Effect>
              {review.availBefore != null && (
                <Effect term="Available on card">
                  <Money value={review.availBefore} tone="muted" /> → <Money value={review.availAfter!} tone={review.over ? "bad" : "good"} />
                  {review.over && <span className="block text-[12px] font-medium text-bad">This takes the card over its limit.</span>}
                </Effect>
              )}
              {review.people.map((p) => (
                <Effect key={p.r.key} term={`${p.r.name.trim()} owes you`} badge="Receivable">
                  +<Money value={p.owed} tone="owed" />{p.charges > 0 && <span className="text-slate-500"> ({taka(p.share)} + {taka(p.charges)} charges)</span>}
                  <span className="block text-[12.5px] text-slate-500">
                    {p.emi
                      ? `EMI ${p.r.months} × ${takaExact(p.sched[0])}${p.sched.at(-1) !== p.sched[0] ? ` (last ${takaExact(p.sched.at(-1)!)})` : ""}, ${dateLong(p.r.due)} to ${dateLong(p.last)}`
                      : `Full payment by ${dateLong(p.r.due)}`}
                  </span>
                </Effect>
              ))}
              {review.mine > 0 && <Effect term="Your own share" badge="Liability"><Money value={review.mine} /> <span className="text-slate-500">of the card balance — you pay this yourself</span></Effect>}
              <Effect term="City Bank balance" badge="Asset"><span>Unchanged — card purchases never touch the bank.</span></Effect>
            </dl>
            <div className="text-[12.5px] text-slate-500">{f.reason.trim()} · {f.category} · {dateLong(f.date)}{rows.length > 1 ? ` · split between ${rows.length} payers` : ""}</div>
          </div>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

function Effect({ term, badge, children }: { term: string; badge?: "Asset" | "Liability" | "Receivable"; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 bg-surface px-3.5 py-2.5 sm:grid-cols-[180px_1fr] sm:gap-3">
      <dt className="flex items-center gap-1.5 font-medium text-slate-600">{term}{badge && <Badge tone={badge === "Asset" ? "good" : badge === "Liability" ? "bad" : "owed"} className="text-[10.5px]">{badge}</Badge>}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}
