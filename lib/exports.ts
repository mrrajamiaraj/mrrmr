// CSV report builders. Pure (rows in, rows out) so they're unit-tested; the /export route only adds the HTTP part.
// Every cell goes through csvCell (quoting + spreadsheet-formula defusing). Amounts stay numbers.
import { buildProfiles, cardLabel, cardPlanStatus, owedOf } from "./ledger.ts";
import { sumBy } from "./money.ts";
import type { FinanceData } from "./types.ts";

export type Table = { name: string; header: string[]; rows: unknown[][] };

/** One debtor's statement: every event with the running balance, then totals per source. */
export function debtorStatement(data: FinanceData, personId: string, today: string): Table | null {
  const p = buildProfiles(data, today).find((x) => x.id === personId);
  if (!p) return null;
  const rows = [...p.events].reverse().map((e) => [e.iso, e.kind, e.detail, e.sign > 0 ? e.amount : "", e.sign < 0 ? e.amount : "", e.owesAfter]);
  rows.push([], ["", "Totals", "Bank loans", p.loanTotal, p.paidLoan, p.loanOut]);
  for (const c of data.cards) {
    const used = data.cardUses.filter((u) => u.person_id === personId && u.card_id === c.id);
    if (!used.length) continue;
    const owed = sumBy(used, owedOf);
    rows.push(["", "Totals", cardLabel(c), owed, "", p.cardOutByCard[c.id] ?? 0]);
  }
  rows.push(["", "Totals", "All sources", p.taken, p.paid, p.owes]);
  return { name: `statement-${p.name.replace(/[^\w-]+/g, "-")}`, header: ["date", "event", "detail", "borrowed", "repaid", "owes_after"], rows };
}

/** One card's transactions (optionally filtered by date). */
export function cardTransactions(data: FinanceData, slot: number, from = "", to = ""): Table | null {
  const card = data.cards.find((c) => c.slot === slot);
  if (!card) return null;
  const names = new Map(data.people.map((p) => [p.id, p.name]));
  const inRange = (iso: string) => (!from || iso >= from) && (!to || iso <= to);
  const rows = [
    ...data.cardUses.filter((u) => u.card_id === card.id && inRange(u.used_on)).map((u) => [
      "purchase", u.used_on, u.person_id ? names.get(u.person_id) : "Me", u.reason_or_place, u.category, u.amount, u.emi_charges ?? 0,
      u.pay_plan ?? "full", u.emi_months ?? "", u.due_on ?? "", u.purchase_group ?? "", u.id,
    ]),
    ...data.repayments.filter((r) => r.applies_to === "card" && r.card_id === card.id && inRange(r.paid_on)).map((r) => [
      "repayment", r.paid_on, names.get(r.person_id), `via ${r.via}`, "", r.amount, "", "", "", "", "", r.id,
    ]),
  ].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  return {
    name: `card-${slot}-${cardLabel(card).replace(/[^\w-]+/g, "-")}`,
    header: ["type", "date", "who", "detail", "category", "amount", "emi_charges", "plan", "emi_months", "due_or_first_installment", "split_group", "id"],
    rows,
  };
}

/** Every EMI installment on every card: what's due when, what's paid, what's left. */
export function emiSchedules(data: FinanceData): Table {
  const names = new Map(data.people.map((p) => [p.id, p.name]));
  const rows: unknown[][] = [];
  for (const card of data.cards) {
    for (const s of cardPlanStatus(data, card.id).values()) {
      if (s.plan !== "emi") continue;
      for (const i of s.installments) {
        rows.push([cardLabel(card), names.get(s.personId), s.reason, s.principal, s.charges, s.amount, `${i.n}/${i.of}`, i.iso, i.amount, i.left, i.left <= 0 ? "paid" : i.left < i.amount ? "partly paid" : "unpaid"]);
      }
    }
  }
  return { name: "emi-schedules", header: ["card", "who", "purchase", "principal", "charges", "total_payable", "installment", "due", "amount", "left", "status"], rows };
}
