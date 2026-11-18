// Relative imports (not "@/lib/…") so tests/ledger.test.mjs can load this file directly under Node.
import { addDays, addMonths, dateLong, dateShort, firstName, initials, pct, taka } from "./format.ts";
import { fromPaisa, installmentAmount, splitInstallments, subMoney, sumBy, toPaisa } from "./money.ts";
import type { Card, CardUse, FinanceData, Loan, PayPlan, Repayment, Status } from "./types.ts";

export type EventKind = "Took loan" | "Used my card" | "Paid back";

export type HistoryEvent = {
  id: string;
  iso: string;
  kind: EventKind;
  detail: string;
  amount: number;
  /** +1 adds to what they owe, −1 reduces it */
  sign: 1 | -1;
  owesAfter: number;
  /** for "Paid back": whether it repaid a loan or card use */
  paidFor?: "loan" | "card";
};

export type DueKind = "late" | "soon" | "later";

export type Profile = {
  id: string;
  name: string;
  first: string;
  initials: string;
  relation: string | null;
  phone: string | null;
  notes: string | null;
  loanTotal: number;
  loanCount: number;
  cardTotal: number;
  cardCount: number;
  paidLoan: number;
  paidCard: number;
  paid: number;
  payCount: number;
  taken: number;
  owes: number;
  loanOut: number;
  cardOut: number;
  /** what they still owe per card id (only for cards with something outstanding) */
  cardOutByCard: Record<string, number>;
  pct: number;
  status: Status;
  due: string | null;
  dueKind: DueKind;
  dueText: string;
  dueShort: string;
  lastIso: string | null;
  txCount: number;
  reasons: string[];
  events: HistoryEvent[];
};

// Theme tokens (not hex), so the colours switch with night mode and keep their contrast there.
export const STATUS_PILL: Record<Status, string> = {
  Pending: "text-bad",
  "Partially Paid": "text-owed",
  Repaid: "text-brand-2",
};

export const DUE_PILL: Record<DueKind, string> = {
  late: "font-medium text-bad",
  soon: "text-owed",
  later: "text-slate-600",
};

/** Display names for the two card slots (routes stay /cards/1 and /cards/2). */
export const CARD_NAMES: Record<1 | 2, string> = {
  1: "City Bank Credit Card",
  2: "Community Bank Credit Card",
};

export function cardLabel(card: Card | undefined) {
  if (!card) return "Card";
  return CARD_NAMES[card.slot] ?? `${card.bank} Credit Card`;
}

export function cardTitle(card: Card) {
  return `${card.bank} ${card.name}`.trim();
}

function dueInfo(due: string | null, owes: number, today: string, next?: PendingInstallment | null) {
  const dueKind: DueKind = !due ? "later" : due < today ? "late" : due <= addDays(today, 7) ? "soon" : "later";
  const dueText =
    owes <= 0 ? "All paid back"
    : due && next && next.of > 1 ? `EMI ${next.n} of ${next.of}: ${taka(next.left)} ${due < today ? "was due" : "due"} ${dateLong(due)}`
    : due ? (due < today ? `Was due ${dateLong(due)}` : `Pay back by ${dateLong(due)}`) : "No pay-back date set";
  const dueShort = !due ? "Not set" : due < today ? `Late — ${dateShort(due)}` : dateShort(due);
  return { dueKind, dueText, dueShort };
}

// ---- credit card payment plans -------------------------------------------------

export type Installment = { useId: string; iso: string; amount: number; n: number; of: number };
/** `paidOn`: the repayment date that cleared it (or last went toward it, if only partly paid). */
export type PendingInstallment = Installment & { left: number; paidOn: string | null };

const isEmi = (u: CardUse) => u.pay_plan === "emi" && (u.emi_months ?? 0) > 1;

/** One installment for a full payment, or one per month for EMI (the last absorbs rounding). */
export function installmentsOf(u: CardUse): Installment[] {
  if (!u.due_on) return [];
  if (!isEmi(u)) return [{ useId: u.id, iso: u.due_on, amount: u.amount, n: 1, of: 1 }];
  const of = u.emi_months!;
  return splitInstallments(u.amount, of).map((amount, i) => ({
    useId: u.id, iso: addMonths(u.due_on!, i), n: i + 1, of, amount,
  }));
}

/** Per-month amount of an EMI use (rounded down to the paisa; the last month absorbs the remainder). */
export function emiPerMonth(amount: number, months: number) {
  return installmentAmount(amount, months);
}

type Payment = { iso: string; amount: number };

/**
 * Applies repayments, oldest first, to installments, earliest due first (like a card statement).
 * Returns each installment with what's still left on it and when it was paid. Works in integer paisa.
 */
export function settle(sched: Installment[], pays: Payment[]): PendingInstallment[] {
  const out: PendingInstallment[] = [...sched]
    .sort((a, b) => a.iso.localeCompare(b.iso) || a.n - b.n)
    .map((s) => ({ ...s, left: s.amount, paidOn: null }));
  const left = out.map((s) => toPaisa(s.amount));
  let i = 0;
  for (const p of [...pays].sort((a, b) => a.iso.localeCompare(b.iso))) {
    let pot = toPaisa(p.amount);
    while (pot > 0 && i < out.length) {
      const take = Math.min(pot, left[i]);
      left[i] -= take;
      pot -= take;
      out[i].paidOn = p.iso || null;
      if (left[i] <= 0) { left[i] = 0; i++; }
    }
  }
  out.forEach((s, k) => { s.left = fromPaisa(left[k]); });
  return out;
}

// ---- bank loans: which loan a repayment pays off -------------------------------------------------------

/** Sorts after every real date: loans with no pay-back date are paid off last. */
const NO_DUE = "9999-12-31";

/**
 * A person's loans in the order repayments pay them off: earliest pay-back date first, loans with no date last,
 * then the oldest loan first. The same rule as card installments (earliest due first).
 */
function loanSchedule(loans: Loan[]): Installment[] {
  return [...loans]
    .sort((a, b) => (a.due_on ?? NO_DUE).localeCompare(b.due_on ?? NO_DUE) || a.taken_on.localeCompare(b.taken_on) || a.created_at.localeCompare(b.created_at))
    .map((l) => ({ useId: l.id, iso: l.due_on ?? NO_DUE, amount: l.amount, n: 1, of: 1 }));
}

/**
 * Applies a person's loan repayments to their loans (see loanSchedule) and returns each loan with what is still
 * left on it. Totals are unchanged — this only decides WHICH loan is paid, so the "late" date is the right one.
 */
export function settleLoans(loans: Loan[], repayments: Pick<Repayment, "paid_on" | "amount">[]): PendingInstallment[] {
  return settle(loanSchedule(loans), repayments.map((r) => ({ iso: r.paid_on, amount: r.amount })));
}

/** Pay-back date of the first loan not fully repaid, or null if all are paid or the next unpaid one has no date. */
export function nextLoanDue(loans: Loan[], repayments: Pick<Repayment, "paid_on" | "amount">[]): string | null {
  const next = settleLoans(loans, repayments).find((s) => s.left > 0);
  return next && next.iso !== NO_DUE ? next.iso : null;
}

/** Due date of the first card installment not fully paid, for one person's uses of one card. */
function nextCardDue(uses: CardUse[], paid: number): string | null {
  return settle(uses.flatMap(installmentsOf), [{ iso: "", amount: paid }]).find((s) => s.left > 0)?.iso ?? null;
}

/** Running "owes after" per event, oldest first, exact to the paisa and never below 0. */
function runningOwes<E extends { sign: 1 | -1; amount: number }>(events: E[]): number[] {
  let run = 0;
  return events.map((e) => {
    run += e.sign * toPaisa(e.amount);
    return fromPaisa(Math.max(run, 0));
  });
}

export type PlanStatus = {
  useId: string;
  personId: string;
  plan: PayPlan;
  reason: string;
  usedOn: string;
  amount: number;
  of: number;
  perMonth: number;
  paidCount: number;
  /** what is still unpaid on this use's installments */
  left: number;
  next: PendingInstallment | null;
  last: string | null;
  installments: PendingInstallment[];
};

/** For every card use on one card: its plan, each installment's paid/left state, and the next one due. */
export function cardPlanStatus(data: FinanceData, cardId: string): Map<string, PlanStatus> {
  const uses = data.cardUses.filter((u) => u.card_id === cardId && u.person_id);
  const out = new Map<string, PlanStatus>();
  for (const person of new Set(uses.map((u) => u.person_id!))) {
    const mine = uses.filter((u) => u.person_id === person);
    const pays = data.repayments
      .filter((r) => r.applies_to === "card" && r.card_id === cardId && r.person_id === person)
      .map((r) => ({ iso: r.paid_on, amount: r.amount }));
    const settled = settle(mine.flatMap(installmentsOf), pays);
    for (const u of mine) {
      const own = settled.filter((s) => s.useId === u.id);
      out.set(u.id, {
        useId: u.id,
        personId: person,
        plan: isEmi(u) ? "emi" : "full",
        reason: u.reason_or_place,
        usedOn: u.used_on,
        amount: u.amount,
        of: own.length,
        perMonth: isEmi(u) ? emiPerMonth(u.amount, u.emi_months!) : u.amount,
        paidCount: own.filter((s) => s.left <= 0).length,
        left: sumBy(own, (s) => s.left),
        next: own.find((s) => s.left > 0) ?? null,
        last: own.length ? own[own.length - 1].iso : null,
        installments: own,
      });
    }
  }
  return out;
}

/** One line for a person's EMIs on a card, e.g. "EMI 2/6 paid · ৳20,000 left". Null if they have none. */
export function emiSummary(plans: PlanStatus[]): string | null {
  const emis = plans.filter((s) => s.plan === "emi");
  if (!emis.length) return null;
  const left = sumBy(emis, (s) => s.left);
  if (left <= 0) return emis.length === 1 ? `EMI ${emis[0].of}/${emis[0].of} paid` : `${emis.length} EMIs paid off`;
  return emis.length === 1
    ? `EMI ${emis[0].paidCount}/${emis[0].of} paid · ${taka(left)} left`
    : `${emis.length} EMIs · ${taka(left)} left`;
}

function planDetail(u: CardUse) {
  if (isEmi(u)) return ` · EMI ${u.emi_months} × ${taka(emiPerMonth(u.amount, u.emi_months!))} from ${dateShort(u.due_on)}`;
  return u.due_on ? ` · pay back by ${dateShort(u.due_on)}` : "";
}

/**
 * Every debtor's profile across loans and all cards. Totals, status and next due come from the
 * debtor_summary view so they match the database exactly; history is built from the raw rows.
 */
export function buildProfiles(data: FinanceData, today: string): Profile[] {
  const cardsById = new Map(data.cards.map((c) => [c.id, c]));
  const summaryById = new Map(data.summary.map((s) => [s.person_id, s]));

  return data.people.map((person) => {
    const L = data.loans.filter((l) => l.person_id === person.id);
    const C = data.cardUses.filter((c) => c.person_id === person.id);
    const R = data.repayments.filter((r) => r.person_id === person.id);
    const s = summaryById.get(person.id);

    const loanTotal = sumBy(L, (x) => x.amount);
    const cardTotal = sumBy(C, (x) => x.amount);
    const paidLoan = sumBy(R.filter((r) => r.applies_to === "loan"), (x) => x.amount);
    const paidCard = sumBy(R.filter((r) => r.applies_to === "card"), (x) => x.amount);
    const paid = sumBy([paidLoan, paidCard], (x) => x);
    const taken = sumBy([loanTotal, cardTotal], (x) => x);
    // The database view is authoritative for what is still owed; the local sum is only a fallback.
    const owes = s ? Math.max(s.still_owes, 0) : Math.max(subMoney(taken, paid), 0);

    // Per card, in paisa: card uses minus card repayments.
    const outP: Record<string, number> = {};
    for (const c of C) outP[c.card_id] = (outP[c.card_id] ?? 0) + toPaisa(c.amount);
    for (const r of R) if (r.applies_to === "card" && r.card_id) outP[r.card_id] = (outP[r.card_id] ?? 0) - toPaisa(r.amount);
    const cardOutByCard: Record<string, number> = {};
    for (const [k, v] of Object.entries(outP)) if (v > 0) cardOutByCard[k] = fromPaisa(v);

    const raw = [
      ...L.map((x) => ({
        id: x.id, iso: x.taken_on, created: x.created_at, o: 0, kind: "Took loan" as const, amount: x.amount, sign: 1 as const,
        detail: `${x.reason} · ${x.method}${x.due_on ? ` · pay back by ${dateShort(x.due_on)}` : ""}`,
      })),
      ...C.map((x) => ({
        id: x.id, iso: x.used_on, created: x.created_at, o: 1, kind: "Used my card" as const, amount: x.amount, sign: 1 as const,
        detail: `${x.reason_or_place} · ${cardLabel(cardsById.get(x.card_id))}${isEmi(x) ? ` · EMI ${x.emi_months} months` : ""}`,
      })),
      ...R.map((x) => ({
        id: x.id, iso: x.paid_on, created: x.created_at, o: 2, kind: "Paid back" as const, amount: x.amount, sign: -1 as const,
        detail: `${x.applies_to === "card" ? `For card use${x.card_id ? ` (${cardLabel(cardsById.get(x.card_id))})` : ""}` : "For loan"} · via ${x.via}`,
        paidFor: x.applies_to,
      })),
    ].sort((a, b) => a.iso.localeCompare(b.iso) || a.o - b.o || a.created.localeCompare(b.created));

    const after = runningOwes(raw);
    const events: HistoryEvent[] = raw
      .map((e, i) => ({
        id: e.id, iso: e.iso, kind: e.kind, detail: e.detail, amount: e.amount, sign: e.sign, owesAfter: after[i],
        paidFor: "paidFor" in e ? e.paidFor : undefined,
      }))
      .reverse();

    const status: Status = s && s.status !== "Overdue" ? s.status : owes <= 0 ? "Repaid" : paid > 0 ? "Partially Paid" : "Pending";
    // Next date that is really due: the first unpaid bank loan, and the first unpaid installment on each card.
    // (The view's next_due only looks at future dates and ignores what has been repaid, so it can't say "late".)
    const dues = [
      nextLoanDue(L, R.filter((r) => r.applies_to === "loan")),
      ...[...new Set(C.map((c) => c.card_id))].map((cardId) =>
        nextCardDue(C.filter((c) => c.card_id === cardId), sumBy(R.filter((r) => r.applies_to === "card" && r.card_id === cardId), (r) => r.amount))),
    ].filter((d): d is string => !!d).sort();
    const due = owes > 0 ? dues[0] ?? null : null;

    return {
      id: person.id, name: person.name, first: firstName(person.name), initials: initials(person.name),
      relation: person.relation, phone: person.phone, notes: person.notes,
      loanTotal, loanCount: L.length, cardTotal, cardCount: C.length, paidLoan, paidCard, paid, payCount: R.length,
      taken, owes,
      loanOut: Math.max(subMoney(loanTotal, paidLoan), 0),
      cardOut: Math.max(subMoney(cardTotal, paidCard), 0),
      cardOutByCard,
      pct: pct(paid, taken),
      status, due, ...dueInfo(due, owes, today),
      lastIso: raw.length ? raw[raw.length - 1].iso : null,
      txCount: raw.length,
      reasons: [...L.map((x) => x.reason), ...(C.length ? ["Card use"] : [])],
      events,
    };
  });
}

export type CardProfile = Omit<Profile, "events" | "reasons" | "status" | "due" | "dueKind" | "dueText" | "dueShort"> & {
  used: number;
  useCount: number;
  status: Status;
  due: string | null;
  dueKind: DueKind;
  dueText: string;
  dueShort: string;
  reasons: string[];
  events: HistoryEvent[];
};

type Scope = { kind: "card"; cardId: string } | { kind: "loans" };

/** Profiles limited to one card. */
export function buildCardProfiles(data: FinanceData, cardId: string, today: string): CardProfile[] {
  return buildScopedProfiles(data, { kind: "card", cardId }, today);
}

/** Profiles limited to bank loans — card use is kept on the card pages. */
export function buildLoanProfiles(data: FinanceData, today: string): CardProfile[] {
  return buildScopedProfiles(data, { kind: "loans" }, today);
}

/**
 * Per-person totals for one money source only: a single card, or bank loans.
 * `used` is what they took from that source; `owes` is what they still owe to it.
 */
function buildScopedProfiles(data: FinanceData, scope: Scope, today: string): CardProfile[] {
  const base = new Map(buildProfiles(data, today).map((p) => [p.id, p]));
  const isCard = scope.kind === "card";
  const takes = isCard
    ? data.cardUses
        .filter((u) => u.card_id === scope.cardId && u.person_id)
        .map((u) => ({ id: u.id, person: u.person_id!, iso: u.used_on, created: u.created_at, amount: u.amount, due: u.due_on, reason: u.reason_or_place,
          sched: installmentsOf(u), detail: `${u.reason_or_place} · #${u.category}${planDetail(u)}` }))
    : data.loans.map((l) => ({ id: l.id, person: l.person_id, iso: l.taken_on, created: l.created_at, amount: l.amount, due: l.due_on, reason: l.reason,
        sched: [] as Installment[], detail: `${l.reason} · ${l.method}${l.due_on ? ` · pay back by ${dateShort(l.due_on)}` : ""}` }));
  const repays = data.repayments.filter((r) => (isCard ? r.applies_to === "card" && r.card_id === scope.cardId : r.applies_to === "loan"));
  const ids = [...new Set([...takes.map((t) => t.person), ...repays.map((r) => r.person_id)])];

  return ids
    .filter((id) => base.has(id))
    .map((id) => {
      const p = base.get(id)!;
      const U = takes.filter((u) => u.person === id);
      const R = repays.filter((r) => r.person_id === id);
      const used = sumBy(U, (x) => x.amount);
      const paid = sumBy(R, (x) => x.amount);
      const owes = Math.max(subMoney(used, paid), 0);

      // Cards: payments clear installments earliest first, so the next due is the first one not fully paid.
      // Loans: the same rule, one "installment" per loan (see loanSchedule).
      const next = isCard && owes > 0 ? settle(U.flatMap((u) => u.sched), [{ iso: "", amount: paid }]).find((s) => s.left > 0) ?? null : null;
      const due = owes <= 0 ? null
        : isCard ? next?.iso ?? null
        : nextLoanDue(data.loans.filter((l) => l.person_id === id), R);
      const status: Status = owes <= 0 ? "Repaid" : paid > 0 ? "Partially Paid" : "Pending";

      const raw = [
        ...U.map((x) => ({
          id: x.id, iso: x.iso, created: x.created, o: 0, kind: (isCard ? "Used my card" : "Took loan") as EventKind,
          amount: x.amount, sign: 1 as const, detail: x.detail,
        })),
        ...R.map((x) => ({
          id: x.id, iso: x.paid_on, created: x.created_at, o: 1, kind: "Paid back" as const, amount: x.amount, sign: -1 as const,
          detail: `via ${x.via}`,
        })),
      ].sort((a, b) => a.iso.localeCompare(b.iso) || a.o - b.o || a.created.localeCompare(b.created));

      const after = runningOwes(raw);
      const events: HistoryEvent[] = raw
        .map((e, i) => ({
          id: e.id, iso: e.iso, kind: e.kind, detail: e.detail, amount: e.amount, sign: e.sign, owesAfter: after[i],
          paidFor: e.sign < 0 ? (isCard ? ("card" as const) : ("loan" as const)) : undefined,
        }))
        .reverse();

      return {
        ...p,
        used, useCount: U.length, paid, payCount: R.length, owes, taken: used,
        loanOut: isCard ? 0 : owes,
        cardOut: isCard ? owes : 0,
        pct: pct(paid, used),
        status, due, ...dueInfo(due, owes, today, next),
        lastIso: raw.length ? raw[raw.length - 1].iso : null,
        txCount: raw.length,
        reasons: U.map((u) => u.reason),
        events,
      };
    });
}

export const byOwesThenName = <T extends { owes: number; name: string }>(a: T, b: T) =>
  b.owes - a.owes || a.name.localeCompare(b.name);

export function amountSigned(sign: 1 | -1, amount: number) {
  return `${sign > 0 ? "− " : "+ "}${taka(amount)}`;
}
