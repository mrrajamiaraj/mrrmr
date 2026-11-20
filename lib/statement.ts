// One person's statement of account: every loan, card purchase and repayment in date order with a running balance.
// Pure (data in, statement out) so it is unit-tested (tests/statement.test.mjs) and shared by the profile page and the
// PDF export. Only this person's rows are ever read.
//
// Running balance: what they owe after each entry, in exact paisa and NOT clamped at 0. If someone has paid more than
// they borrowed the balance goes negative and is shown as a credit, so opening + borrowed - repaid = closing always
// holds. (Profile "owes" figures elsewhere clamp at 0; that is a display rule, not an accounting one.)
//
// Relative imports so Node's test runner can load this file directly.
import { cardLabel, owedOf } from "./ledger.ts";
import { fromPaisa, toPaisa } from "./money.ts";
import { dateLong } from "./format.ts";
import type { FinanceData } from "./types.ts";

export type StatementKind = "loan" | "card_use" | "repayment";

export type StatementRow = {
  id: string;
  kind: StatementKind;
  iso: string;
  /** "Loan" | "Card purchase" | "Repayment" */
  type: string;
  description: string;
  /** how the money moved, when recorded (loan method, or repayment via) */
  method: string | null;
  /** adds to what they owe */
  borrowed: number | null;
  /** reduces what they owe */
  repaid: number | null;
  /** what they owe after this entry (negative = in credit) */
  balance: number;
};

export type Statement = {
  personId: string;
  name: string;
  generatedOn: string;
  /** inclusive range; null = from the first entry / up to today */
  from: string | null;
  to: string | null;
  /** balance carried in from before `from` (0 for a full history) */
  opening: number;
  rows: StatementRow[];
  /** within the range */
  borrowed: number;
  repaid: number;
  closing: number;
  /** all time, regardless of the range */
  allTime: { borrowed: number; repaid: number; balance: number };
  filename: string;
};

/** 1,43,345.00: Bangladeshi digit grouping, always two decimals (statements show exact paisa). */
export function bdt(n: number) {
  return Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ASCII-only, filesystem-safe piece of a filename. */
export function slug(s: string) {
  const out = s.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 48);
  return out || "person";
}

const ORDER: Record<StatementKind, number> = { loan: 0, card_use: 1, repayment: 2 };

export function buildStatement(
  data: FinanceData,
  personId: string,
  today: string,
  range: { from?: string | null; to?: string | null } = {}
): Statement | null {
  const person = data.people.find((p) => p.id === personId);
  if (!person) return null;
  const from = range.from || null;
  const to = range.to || null;
  const cards = new Map(data.cards.map((c) => [c.id, c]));

  const all = [
    ...data.loans.filter((l) => l.person_id === personId).map((l) => ({
      id: l.id, kind: "loan" as const, iso: l.taken_on, created: l.created_at, type: "Loan",
      description: `${l.reason}${l.due_on ? ` · pay back by ${dateLong(l.due_on)}` : ""}`, method: l.method as string | null, sign: 1, amount: l.amount,
    })),
    ...data.cardUses.filter((u) => u.person_id === personId).map((u) => ({
      id: u.id, kind: "card_use" as const, iso: u.used_on, created: u.created_at, type: "Card purchase",
      description: [
        u.reason_or_place,
        cardLabel(cards.get(u.card_id)),
        u.pay_plan === "emi" && (u.emi_months ?? 0) > 1 ? `EMI ${u.emi_months} months` : null,
        u.emi_charges ? `incl. BDT ${bdt(u.emi_charges)} EMI charges` : null,
      ].filter(Boolean).join(" · "),
      method: null as string | null, sign: 1, amount: owedOf(u),
    })),
    ...data.repayments.filter((r) => r.person_id === personId).map((r) => ({
      id: r.id, kind: "repayment" as const, iso: r.paid_on, created: r.created_at, type: "Repayment",
      description: r.applies_to === "card" ? `For card purchases${r.card_id ? ` · ${cardLabel(cards.get(r.card_id))}` : ""}` : "For loans",
      method: r.via as string | null, sign: -1, amount: r.amount,
    })),
  ].sort((a, b) => a.iso.localeCompare(b.iso) || ORDER[a.kind] - ORDER[b.kind] || a.created.localeCompare(b.created));

  let run = 0, opening = 0, borrowedP = 0, repaidP = 0, allB = 0, allR = 0;
  const rows: StatementRow[] = [];
  for (const e of all) {
    const p = toPaisa(e.amount);
    run += e.sign * p;
    if (e.sign > 0) allB += p; else allR += p;
    if (from && e.iso < from) { opening = run; continue; }
    if (to && e.iso > to) continue;
    if (e.sign > 0) borrowedP += p; else repaidP += p;
    rows.push({
      id: e.id, kind: e.kind, iso: e.iso, type: e.type, description: e.description, method: e.method,
      borrowed: e.sign > 0 ? e.amount : null, repaid: e.sign < 0 ? e.amount : null, balance: fromPaisa(run),
    });
  }
  return {
    personId, name: person.name, generatedOn: today, from, to,
    opening: fromPaisa(opening), rows, borrowed: fromPaisa(borrowedP), repaid: fromPaisa(repaidP),
    closing: fromPaisa(opening + borrowedP - repaidP),
    allTime: { borrowed: fromPaisa(allB), repaid: fromPaisa(allR), balance: fromPaisa(allB - allR) },
    filename: `MRRMR-statement-${slug(person.name)}-${from ?? "start"}-to-${to ?? today}.pdf`,
  };
}
