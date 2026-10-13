import { addDays, dateLong, dateShort, firstName, initials, pct, taka } from "@/lib/format";
import type { Card, FinanceData, Status } from "@/lib/types";

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

export const STATUS_PILL: Record<Status, string> = {
  Pending: "bg-[#DBEAFE] text-[#1D4ED8]",
  "Partially Paid": "bg-[#FEF3C7] text-[#92400E]",
  Repaid: "bg-[#D1FAE5] text-[#065F46]",
  Overdue: "bg-[#FEE2E2] text-[#B91C1C]",
};

export const DUE_PILL: Record<DueKind, string> = {
  late: "bg-[#FEE2E2] text-[#B91C1C]",
  soon: "bg-[#FEF3C7] text-[#92400E]",
  later: "bg-[#DBEAFE] text-[#1D4ED8]",
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

function dueInfo(due: string | null, owes: number, today: string) {
  const dueKind: DueKind = !due ? "later" : due < today ? "late" : due <= addDays(today, 7) ? "soon" : "later";
  const dueText =
    owes <= 0 ? "All paid back" : due ? (due < today ? `Was due ${dateLong(due)}` : `Pay back by ${dateLong(due)}`) : "No pay-back date set";
  const dueShort = !due ? "Not set" : due < today ? `Late — ${dateShort(due)}` : dateShort(due);
  return { dueKind, dueText, dueShort };
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

    const loanTotal = L.reduce((t, x) => t + x.amount, 0);
    const cardTotal = C.reduce((t, x) => t + x.amount, 0);
    const paidLoan = R.filter((r) => r.applies_to === "loan").reduce((t, x) => t + x.amount, 0);
    const paidCard = R.filter((r) => r.applies_to === "card").reduce((t, x) => t + x.amount, 0);
    const paid = paidLoan + paidCard;
    const taken = loanTotal + cardTotal;
    const owes = s ? Math.max(s.still_owes, 0) : Math.max(taken - paid, 0);

    const cardOutByCard: Record<string, number> = {};
    for (const c of C) cardOutByCard[c.card_id] = (cardOutByCard[c.card_id] ?? 0) + c.amount;
    for (const r of R) if (r.applies_to === "card" && r.card_id) cardOutByCard[r.card_id] = (cardOutByCard[r.card_id] ?? 0) - r.amount;
    for (const k of Object.keys(cardOutByCard)) if (cardOutByCard[k] <= 0) delete cardOutByCard[k];

    const raw = [
      ...L.map((x) => ({
        id: x.id, iso: x.taken_on, created: x.created_at, o: 0, kind: "Took loan" as const, amount: x.amount, sign: 1 as const,
        detail: `${x.reason} · ${x.method}${x.due_on ? ` · pay back by ${dateShort(x.due_on)}` : ""}`,
      })),
      ...C.map((x) => ({
        id: x.id, iso: x.used_on, created: x.created_at, o: 1, kind: "Used my card" as const, amount: x.amount, sign: 1 as const,
        detail: `${x.reason_or_place} · ${cardLabel(cardsById.get(x.card_id))}`,
      })),
      ...R.map((x) => ({
        id: x.id, iso: x.paid_on, created: x.created_at, o: 2, kind: "Paid back" as const, amount: x.amount, sign: -1 as const,
        detail: `${x.applies_to === "card" ? `For card use${x.card_id ? ` (${cardLabel(cardsById.get(x.card_id))})` : ""}` : "For loan"} · via ${x.via}`,
        paidFor: x.applies_to,
      })),
    ].sort((a, b) => a.iso.localeCompare(b.iso) || a.o - b.o || a.created.localeCompare(b.created));

    let run = 0;
    const events: HistoryEvent[] = raw
      .map((e) => {
        run += e.sign * e.amount;
        return { id: e.id, iso: e.iso, kind: e.kind, detail: e.detail, amount: e.amount, sign: e.sign, owesAfter: Math.max(run, 0), paidFor: "paidFor" in e ? e.paidFor : undefined };
      })
      .reverse();

    const status: Status = s?.status ?? (owes <= 0 ? "Repaid" : paid > 0 ? "Partially Paid" : "Pending");
    const due = owes > 0 ? s?.next_due ?? null : null;

    return {
      id: person.id, name: person.name, first: firstName(person.name), initials: initials(person.name),
      relation: person.relation, phone: person.phone, notes: person.notes,
      loanTotal, loanCount: L.length, cardTotal, cardCount: C.length, paidLoan, paidCard, paid, payCount: R.length,
      taken, owes,
      loanOut: Math.max(loanTotal - paidLoan, 0),
      cardOut: Math.max(cardTotal - paidCard, 0),
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
          detail: `${u.reason_or_place} · #${u.category}${u.due_on ? ` · pay back by ${dateShort(u.due_on)}` : ""}` }))
    : data.loans.map((l) => ({ id: l.id, person: l.person_id, iso: l.taken_on, created: l.created_at, amount: l.amount, due: l.due_on, reason: l.reason,
        detail: `${l.reason} · ${l.method}${l.due_on ? ` · pay back by ${dateShort(l.due_on)}` : ""}` }));
  const repays = data.repayments.filter((r) => (isCard ? r.applies_to === "card" && r.card_id === scope.cardId : r.applies_to === "loan"));
  const ids = [...new Set([...takes.map((t) => t.person), ...repays.map((r) => r.person_id)])];

  return ids
    .filter((id) => base.has(id))
    .map((id) => {
      const p = base.get(id)!;
      const U = takes.filter((u) => u.person === id);
      const R = repays.filter((r) => r.person_id === id);
      const used = U.reduce((t, x) => t + x.amount, 0);
      const paid = R.reduce((t, x) => t + x.amount, 0);
      const owes = Math.max(used - paid, 0);

      const dues = U.map((u) => u.due).filter((d): d is string => !!d).sort();
      const late = dues.filter((d) => d < today);
      const due = owes > 0 ? (late.length ? late[late.length - 1] : dues[0] ?? null) : null;
      const status: Status = owes <= 0 ? "Repaid" : due && due < today ? "Overdue" : paid > 0 ? "Partially Paid" : "Pending";

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

      let run = 0;
      const events: HistoryEvent[] = raw
        .map((e) => {
          run += e.sign * e.amount;
          return {
            id: e.id, iso: e.iso, kind: e.kind, detail: e.detail, amount: e.amount, sign: e.sign, owesAfter: Math.max(run, 0),
            paidFor: e.sign < 0 ? (isCard ? "card" : "loan") : undefined,
          };
        })
        .reverse();

      return {
        ...p,
        used, useCount: U.length, paid, payCount: R.length, owes, taken: used,
        loanOut: isCard ? 0 : owes,
        cardOut: isCard ? owes : 0,
        pct: pct(paid, used),
        status, due, ...dueInfo(due, owes, today),
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
