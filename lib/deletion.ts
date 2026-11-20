// What deleting history entries would change, computed BEFORE anything is deleted, so the confirmation dialog can show
// an exact impact preview. Pure; tested in tests/deletion.test.mjs.
//
// The ledger rows do not record whether saving them changed the bank or card balance (a loan can be "from City Bank"
// without having been deducted). So for every entry with a linked balance this module groups a question — "did the
// balance change when you saved these?" — and the dialog asks it. Nothing is reversed unless the admin answers yes;
// "not sure" keeps the records. The reversal itself is done by delete_record / delete_records in Postgres.
//
// Relative imports so Node's test runner can load this file directly.
import { buildProfiles, cardLabel, owedOf } from "./ledger.ts";
import { subMoney, sumBy } from "./money.ts";
import type { FinanceData } from "./types.ts";

export type RecordKind = "loan" | "card_use" | "repayment";
export type DeleteItem = { kind: RecordKind; id: string };

/** One balance question: entries of one kind linked to one account or card. */
export type BalanceGroup = {
  key: string;
  target: "account" | "card";
  targetId: string;
  place: string;
  kind: RecordKind;
  count: number;
  total: number;
  /** the question, e.g. "When you saved these 2 loans, was ৳5,000 taken out of City Bank?" */
  question: string;
  /** what answering yes does, e.g. "Put ৳5,000 back into City Bank" */
  reversal: string;
};

export type ImpactEntry = {
  kind: RecordKind;
  id: string;
  iso: string;
  amount: number;
  label: string;
  personId: string | null;
  group: string | null;
  emi: boolean;
  /** one share of a split purchase (the other shares are kept) */
  split: boolean;
};

export type PersonEffect = { personId: string; name: string; before: number; after: number; loanBefore: number; loanAfter: number; cardBefore: number; cardAfter: number };

export type Impact = {
  entries: ImpactEntry[];
  missing: DeleteItem[];
  groups: BalanceGroup[];
  people: PersonEffect[];
  emiPlans: number;
  /** other shares of split purchases that stay */
  sharedKept: number;
  /** repayments that would be left with nothing to repay (they paid more than what remains) */
  excess: number;
  /** repayments being deleted while their loans/purchases stay: what they owe goes UP */
  repaymentTotal: number;
};

const fmt = (n: number) => "৳" + Math.round(Math.abs(n)).toLocaleString("en-IN");

export function deletionImpact(data: FinanceData, today: string, items: DeleteItem[]): Impact {
  const people = new Map(data.people.map((p) => [p.id, p.name]));
  const cards = new Map(data.cards.map((c) => [c.id, c]));
  const accounts = new Map(data.accounts.map((a) => [a.id, a.name]));
  const want = new Set(items.map((i) => `${i.kind}:${i.id}`));
  const entries: ImpactEntry[] = [];
  const groups = new Map<string, BalanceGroup>();
  const link = (target: "account" | "card", targetId: string, kind: RecordKind, amount: number) => {
    const key = `${target}:${targetId}:${kind}`;
    const place = target === "account" ? accounts.get(targetId) ?? "the bank account" : cardLabel(cards.get(targetId));
    const g = groups.get(key) ?? { key, target, targetId, place, kind, count: 0, total: 0, question: "", reversal: "" };
    g.count++;
    g.total = sumBy([g.total, amount], (x) => x);
    groups.set(key, g);
    return key;
  };

  for (const l of data.loans) if (want.has(`loan:${l.id}`)) {
    entries.push({ kind: "loan", id: l.id, iso: l.taken_on, amount: l.amount, label: `Loan · ${l.reason}`, personId: l.person_id, emi: false, split: false,
      group: l.account_id ? link("account", l.account_id, "loan", l.amount) : null });
  }
  for (const u of data.cardUses) if (want.has(`card_use:${u.id}`)) {
    entries.push({ kind: "card_use", id: u.id, iso: u.used_on, amount: u.amount, label: `Card purchase · ${u.reason_or_place}`, personId: u.person_id,
      emi: u.pay_plan === "emi" && (u.emi_months ?? 0) > 1, split: !!u.purchase_group, group: link("card", u.card_id, "card_use", u.amount) });
  }
  for (const r of data.repayments) if (want.has(`repayment:${r.id}`)) {
    const g = r.applies_to === "loan" ? (r.account_id ? link("account", r.account_id, "repayment", r.amount) : null)
      : r.card_id ? link("card", r.card_id, "repayment", r.amount) : null;
    entries.push({ kind: "repayment", id: r.id, iso: r.paid_on, amount: r.amount, label: `Repayment · via ${r.via}`, personId: r.person_id, emi: false, split: false, group: g });
  }
  entries.sort((a, b) => a.iso.localeCompare(b.iso));
  const found = new Set(entries.map((e) => `${e.kind}:${e.id}`));
  const missing = items.filter((i) => !found.has(`${i.kind}:${i.id}`));

  // Wording per group: the question and what "yes" reverses (mirrors delete_record exactly).
  for (const g of groups.values()) {
    const n = g.count, a = fmt(g.total);
    const these = n === 1 ? "this" : `these ${n}`;
    if (g.kind === "loan") { g.question = `When you saved ${these} loan${n === 1 ? "" : "s"}, was ${a} taken out of ${g.place}?`; g.reversal = `Put ${a} back into ${g.place}`; }
    else if (g.kind === "card_use") { g.question = `When you saved ${these} purchase${n === 1 ? "" : "s"}, was ${a} added to the ${g.place} balance?`; g.reversal = `Take ${a} off the ${g.place} balance (never below ৳0)`; }
    else if (g.target === "account") { g.question = `When you saved ${these} repayment${n === 1 ? "" : "s"}, was ${a} added to ${g.place}?`; g.reversal = `Take ${a} back out of ${g.place}`; }
    else { g.question = `When you saved ${these} repayment${n === 1 ? "" : "s"}, did it lower the ${g.place} balance by ${a}?`; g.reversal = `Add ${a} back to the ${g.place} balance`; }
  }

  // Before/after for every person touched: recomputed from the rows that would remain (exact; same rules as every page).
  const touched = [...new Set(entries.map((e) => e.personId).filter((x): x is string => !!x))];
  const after: FinanceData = {
    ...data,
    loans: data.loans.filter((l) => !want.has(`loan:${l.id}`)),
    cardUses: data.cardUses.filter((u) => !want.has(`card_use:${u.id}`)),
    repayments: data.repayments.filter((r) => !want.has(`repayment:${r.id}`)),
    // The database view would be recomputed too; drop the touched people's rows so profiles use the local totals.
    summary: data.summary.filter((s) => !touched.includes(s.person_id)),
  };
  const beforeP = new Map(buildProfiles(data, today).map((p) => [p.id, p]));
  const afterP = new Map(buildProfiles(after, today).map((p) => [p.id, p]));
  const effects: PersonEffect[] = touched.map((id) => {
    const b = beforeP.get(id)!, a = afterP.get(id)!;
    return { personId: id, name: people.get(id) ?? "Unknown", before: b.owes, after: a.owes, loanBefore: b.loanOut, loanAfter: a.loanOut, cardBefore: b.cardOut, cardAfter: a.cardOut };
  });

  // Repayments that would exceed what is left to repay, per person and source (they stay recorded as an overpayment).
  let excess = 0;
  for (const id of touched) {
    const paidL = sumBy(after.repayments.filter((r) => r.person_id === id && r.applies_to === "loan"), (r) => r.amount);
    const takenL = sumBy(after.loans.filter((l) => l.person_id === id), (l) => l.amount);
    if (paidL > takenL) excess = sumBy([excess, subMoney(paidL, takenL)], (x) => x);
    for (const c of data.cards) {
      const paidC = sumBy(after.repayments.filter((r) => r.person_id === id && r.applies_to === "card" && r.card_id === c.id), (r) => r.amount);
      const takenC = sumBy(after.cardUses.filter((u) => u.person_id === id && u.card_id === c.id), owedOf);
      if (paidC > takenC) excess = sumBy([excess, subMoney(paidC, takenC)], (x) => x);
    }
  }

  const groupIds = new Set(entries.filter((e) => e.split).map((e) => data.cardUses.find((u) => u.id === e.id)!.purchase_group));
  return {
    entries, missing, groups: [...groups.values()], people: effects,
    emiPlans: entries.filter((e) => e.emi).length,
    sharedKept: data.cardUses.filter((u) => u.purchase_group && groupIds.has(u.purchase_group) && !want.has(`card_use:${u.id}`)).length,
    excess,
    repaymentTotal: sumBy(entries.filter((e) => e.kind === "repayment"), (e) => e.amount),
  };
}

/** Every entry in one person's history (loans, their card purchases, repayments) — for "Delete all history". */
export function personItems(data: FinanceData, personId: string): DeleteItem[] {
  return [
    ...data.loans.filter((l) => l.person_id === personId).map((l) => ({ kind: "loan" as const, id: l.id })),
    ...data.cardUses.filter((u) => u.person_id === personId).map((u) => ({ kind: "card_use" as const, id: u.id })),
    ...data.repayments.filter((r) => r.person_id === personId).map((r) => ({ kind: "repayment" as const, id: r.id })),
  ];
}
