// The Overview dashboard's figures, derived ONLY from ledger rows and the database view. Pure, so it is unit-tested
// (tests/dashboard.test.mjs). Definitions are documented in docs/METRICS.md.
//
// Four kinds of number are kept strictly apart and never added together:
//   ASSET        cash in the bank (accounts.balance, as stored)
//   RECEIVABLE   money other people owe you (bank loans; card purchases they made on your cards)
//   LIABILITY    money you owe the card issuers (cards.balance)
//   PROJECTION   what the bank balance would be if bank-loan receivables were repaid — never "available"
//
// Relative imports so Node's test runner can load this file directly.
import { addDays, monthLabel } from "./format.ts";
import { fromPaisa, subMoney, sumBy, toPaisa } from "./money.ts";
import { cardLabel, installmentsOf, NO_DUE, owedOf, settle, settleLoans } from "./ledger.ts";
import type { Card, FinanceData } from "./types.ts";

export type DueStatus = "overdue" | "week" | "later" | "undated";

/** One unpaid piece of a receivable: a bank loan, a card installment, or an undated card balance. */
export type OpenItem = {
  key: string;
  source: "loan" | "card";
  cardId: string | null;
  personId: string;
  name: string;
  /** due date, or null when none was set */
  iso: string | null;
  left: number;
  status: DueStatus;
  /** part of an EMI plan (card installments only) */
  emi: boolean;
};

export type CardSummary = {
  card: Card;
  label: string;
  /** LIABILITY: what is owed on the card, as stored */
  balance: number;
  limit: number | null;
  available: number | null;
  utilization: number | null;
  /** RECEIVABLE: what other people still owe for purchases on this card */
  othersOwe: number;
  /** balance − othersOwe: the part of the card balance that is your own (negative = card balance looks out of date) */
  myShare: number;
  emiOutstanding: number;
  nextEmi: OpenItem | null;
  payBy: string | null;
  payByPassed: boolean;
};

export type ActivityKind = "loan" | "card_other" | "card_own" | "repayment";
export type Activity = {
  id: string;
  iso: string;
  created: string;
  kind: ActivityKind;
  name: string;
  /** whose record it is; null for your own card spending */
  personId: string | null;
  amount: number;
  /** where the money came from / went to */
  source: string;
  detail: string;
  status: string;
  statusTone: "good" | "owed" | "bad" | "neutral";
};

export type Period = { lentLoans: number; lentCard: number; lent: number; recovered: number; ownCard: number };

export type Dashboard = {
  today: string;
  bank: { name: string; balance: number; updatedAt: string; debitUsed: number } | null;
  receivables: { bankLoans: number; byCard: Record<string, number>; cards: number; total: number; viewTotal: number; reconciled: boolean };
  projection: { bankAfterLoans: number } | null;
  liabilities: { cards: number };
  cards: CardSummary[];
  open: OpenItem[];
  overdue: { count: number; amount: number };
  dueWeek: { count: number; amount: number };
  undated: { count: number; amount: number };
  monthToDate: { label: string; days: number; current: Period; previous: Period; previousLabel: string };
  activity: Activity[];
  obligations: { cardId: string; label: string; iso: string; amount: number; passed: boolean }[];
};

const statusOf = (iso: string | null, today: string): DueStatus =>
  !iso ? "undated" : iso < today ? "overdue" : iso <= addDays(today, 7) ? "week" : "later";

function shiftMonth(ym: string, by: number) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}
const lastDay = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

function period(data: FinanceData, from: string, to: string): Period {
  const inRange = (iso: string) => iso >= from && iso <= to;
  const lentLoans = sumBy(data.loans.filter((l) => inRange(l.taken_on)), (l) => l.amount);
  const lentCard = sumBy(data.cardUses.filter((u) => u.person_id && inRange(u.used_on)), (u) => u.amount);
  return {
    lentLoans, lentCard, lent: sumBy([lentLoans, lentCard], (x) => x),
    recovered: sumBy(data.repayments.filter((r) => inRange(r.paid_on)), (r) => r.amount),
    ownCard: sumBy(data.cardUses.filter((u) => !u.person_id && inRange(u.used_on)), (u) => u.amount),
  };
}

export function computeDashboard(data: FinanceData, today: string): Dashboard {
  const names = new Map(data.people.map((p) => [p.id, p.name]));
  const account = data.accounts[0] ?? null;

  // ---- open receivable items (allocation rules from lib/ledger: earliest-due first) ------------------------------
  const open: OpenItem[] = [];
  const loanLeftById = new Map<string, number>();
  const useLeftById = new Map<string, number>();
  for (const person of data.people) {
    const name = person.name;
    const L = data.loans.filter((l) => l.person_id === person.id);
    const RL = data.repayments.filter((r) => r.person_id === person.id && r.applies_to === "loan");
    for (const s of settleLoans(L, RL)) {
      loanLeftById.set(s.useId, s.left);
      if (s.left > 0) {
        const iso = s.iso === NO_DUE ? null : s.iso;
        open.push({ key: `l:${s.useId}`, source: "loan", cardId: null, personId: person.id, name, iso, left: s.left, status: statusOf(iso, today), emi: false });
      }
    }
    for (const card of data.cards) {
      const U = data.cardUses.filter((u) => u.person_id === person.id && u.card_id === card.id);
      if (!U.length) continue;
      const paid = sumBy(data.repayments.filter((r) => r.person_id === person.id && r.applies_to === "card" && r.card_id === card.id), (r) => r.amount);
      const owes = Math.max(subMoney(sumBy(U, owedOf), paid), 0);
      const settled = settle(U.flatMap(installmentsOf), [{ iso: "", amount: paid }]);
      for (const s of settled) useLeftById.set(s.useId, fromPaisa(toPaisa(useLeftById.get(s.useId) ?? 0) + toPaisa(s.left)));
      let dated = 0;
      for (const s of settled) {
        if (s.left <= 0) continue;
        dated = fromPaisa(toPaisa(dated) + toPaisa(s.left));
        open.push({ key: `c:${s.useId}:${s.n}`, source: "card", cardId: card.id, personId: person.id, name, iso: s.iso, left: s.left, status: statusOf(s.iso, today), emi: s.of > 1 });
      }
      // Card uses with no due date have no installments: what they still owe is the remainder.
      const undatedLeft = subMoney(owes, dated);
      if (undatedLeft > 0) {
        open.push({ key: `u:${person.id}:${card.id}`, source: "card", cardId: card.id, personId: person.id, name, iso: null, left: undatedLeft, status: "undated", emi: false });
      }
    }
  }
  open.sort((a, b) => (a.iso ?? NO_DUE).localeCompare(b.iso ?? NO_DUE) || b.left - a.left);

  const agg = (f: (o: OpenItem) => boolean) => { const xs = open.filter(f); return { count: xs.length, amount: sumBy(xs, (o) => o.left) }; };
  const bankLoans = sumBy(open.filter((o) => o.source === "loan"), (o) => o.left);
  const byCard: Record<string, number> = {};
  for (const c of data.cards) byCard[c.id] = sumBy(open.filter((o) => o.cardId === c.id), (o) => o.left);
  const cardsRecv = sumBy(Object.values(byCard), (x) => x);
  const total = sumBy([bankLoans, cardsRecv], (x) => x);
  // The database view nets loans and cards per person; it matches the per-source total unless someone has overpaid
  // one source while owing on another. Shown as a reconciliation check, never silently replaced.
  const viewTotal = sumBy(data.summary, (s) => Math.max(Number(s.still_owes), 0));

  // ---- cards (liabilities, with the receivable share split out) --------------------------------------------------
  const cards: CardSummary[] = data.cards.map((card) => {
    const othersOwe = byCard[card.id] ?? 0;
    const emiItems = open.filter((o) => o.cardId === card.id && o.emi);
    const limit = card.credit_limit;
    return {
      card, label: cardLabel(card), balance: card.balance, limit,
      available: limit != null ? Math.max(subMoney(limit, card.balance), 0) : null,
      utilization: limit ? Math.round((card.balance / limit) * 1000) / 10 : null,
      othersOwe, myShare: subMoney(card.balance, othersOwe),
      emiOutstanding: sumBy(emiItems, (o) => o.left),
      nextEmi: emiItems.find((o) => o.iso && o.iso >= today) ?? emiItems[0] ?? null,
      payBy: card.pay_by, payByPassed: !!card.pay_by && card.pay_by < today && card.balance > 0,
    };
  });

  // ---- month to date vs the same days last month (never a full month against a partial one) -----------------------
  const ym = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const prevYm = shiftMonth(ym, -1);
  const prevTo = `${prevYm}-${String(Math.min(day, lastDay(prevYm))).padStart(2, "0")}`;
  const monthToDate = {
    label: monthLabel(ym), days: day, current: period(data, `${ym}-01`, today),
    previous: period(data, `${prevYm}-01`, prevTo), previousLabel: `${monthLabel(prevYm)} 1–${Number(prevTo.slice(8))}`,
  };

  // ---- activity: every ledger row once (no derived or duplicated entries) -------------------------------------------
  const cardsById = new Map(data.cards.map((c) => [c.id, c]));
  const plansLeft = (useId: string, personId: string, cardId: string) => {
    const u = data.cardUses.find((x) => x.id === useId)!;
    const personCardOwes = sumBy(open.filter((o) => o.personId === personId && o.cardId === cardId), (o) => o.left);
    if (personCardOwes <= 0) return { status: "Repaid", tone: "good" as const };
    if (!u.due_on) return { status: "Owed · no due date", tone: "owed" as const };
    const left = useLeftById.get(useId) ?? 0;
    if (left <= 0) return { status: "Repaid", tone: "good" as const };
    const late = open.some((o) => o.key.startsWith(`c:${useId}:`) && o.status === "overdue");
    return { status: late ? "Overdue" : left < owedOf(u) ? "Part repaid" : "Outstanding", tone: late ? "bad" as const : "owed" as const };
  };
  const activity: Activity[] = [
    ...data.loans.map((l): Activity => {
      const left = loanLeftById.get(l.id) ?? 0;
      const late = left > 0 && !!l.due_on && l.due_on < today;
      return {
        id: l.id, iso: l.taken_on, created: l.created_at, kind: "loan", name: names.get(l.person_id) ?? "Unknown", personId: l.person_id, amount: l.amount,
        source: account?.name ?? "Bank", detail: `${l.reason} · ${l.method}`,
        status: left <= 0 ? "Repaid" : late ? "Overdue" : left < l.amount ? "Part repaid" : "Outstanding",
        statusTone: left <= 0 ? "good" : late ? "bad" : "owed",
      };
    }),
    ...data.cardUses.map((u): Activity => {
      const own = !u.person_id;
      const st = own ? { status: "Your spending", tone: "neutral" as const } : plansLeft(u.id, u.person_id!, u.card_id);
      return {
        id: u.id, iso: u.used_on, created: u.created_at, kind: own ? "card_own" : "card_other", name: own ? "You" : names.get(u.person_id!) ?? "Unknown", personId: u.person_id,
        amount: u.amount, source: cardLabel(cardsById.get(u.card_id)),
        detail: `${u.reason_or_place} · ${u.category}${u.pay_plan === "emi" ? ` · EMI ${u.emi_months} months` : ""}${u.emi_charges ? ` · + ${fmt(u.emi_charges)} charges owed` : ""}${u.purchase_group ? " · split purchase" : ""}`,
        status: st.status, statusTone: st.tone,
      };
    }),
    ...data.repayments.map((r): Activity => ({
      id: r.id, iso: r.paid_on, created: r.created_at, kind: "repayment", name: names.get(r.person_id) ?? "Unknown", personId: r.person_id, amount: r.amount,
      source: r.applies_to === "card" ? cardLabel(r.card_id ? cardsById.get(r.card_id) : undefined) : "Bank loans",
      detail: `via ${r.via}`, status: "Received", statusTone: "good",
    })),
  ].sort((a, b) => b.iso.localeCompare(a.iso) || b.created.localeCompare(a.created));

  // ---- your own obligations: card balances with a pay-by date ---------------------------------------------------
  const obligations = cards
    .filter((c) => c.balance > 0 && c.payBy)
    .map((c) => ({ cardId: c.card.id, label: c.label, iso: c.payBy!, amount: c.balance, passed: c.payByPassed }))
    .sort((a, b) => a.iso.localeCompare(b.iso));

  const overdue = agg((o) => o.status === "overdue");
  const dueWeek = agg((o) => o.status === "week");
  const undated = agg((o) => o.status === "undated");

  return {
    today,
    bank: account ? { name: account.name, balance: account.balance, updatedAt: account.updated_at, debitUsed: account.debit_used } : null,
    receivables: { bankLoans, byCard, cards: cardsRecv, total, viewTotal, reconciled: toPaisa(total) === toPaisa(viewTotal) },
    projection: account ? { bankAfterLoans: sumBy([account.balance, bankLoans], (x) => x) } : null,
    liabilities: { cards: sumBy(data.cards, (c) => c.balance) },
    cards, open, overdue, dueWeek, undated,
    monthToDate, activity, obligations,
  };
}

const fmt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");

/** Pairs of names (4+ letters) at edit distance 1, case-insensitive: "Mamun Vai" / "Mamun Vau". */
export function similarNames(names: string[]): [string, string][] {
  const within1 = (a: string, b: string) => {
    if (a === b || Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  };
  const out: [string, string][] = [];
  const n = names.map((s) => s.trim().toLowerCase());
  for (let i = 0; i < n.length; i++)
    for (let k = i + 1; k < n.length; k++)
      if (n[i].length >= 4 && n[k].length >= 4 && within1(n[i], n[k])) out.push([names[i], names[k]]);
  return out;
}
