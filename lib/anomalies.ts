// Deterministic data checks. Each warning says what it found and where; NOTHING here changes or deletes data.
// Pure; tested in tests/anomalies.test.mjs.
import { owedOf } from "./ledger.ts";
import { similarNames, type Dashboard } from "./dashboard.ts";
import { subMoney, sumBy } from "./money.ts";
import type { FinanceData } from "./types.ts";

export type Anomaly = { id: string; severity: "high" | "medium" | "low"; kind: string; title: string; detail: string; href?: string };

export function findAnomalies(data: FinanceData, d: Dashboard, today: string): Anomaly[] {
  const out: Anomaly[] = [];
  const name = new Map(data.people.map((p) => [p.id, p.name]));
  const fmt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");

  // 1. Duplicate-looking entries: same person, kind, amount and date more than once.
  const groups = new Map<string, { kind: string; who: string; iso: string; amount: number; n: number }>();
  const add = (kind: string, who: string, iso: string, amount: number) => {
    const k = `${kind}|${who}|${iso}|${amount}`;
    const g = groups.get(k) ?? { kind, who, iso, amount, n: 0 };
    g.n++; groups.set(k, g);
  };
  for (const l of data.loans) add("loan", l.person_id, l.taken_on, l.amount);
  for (const u of data.cardUses) if (!u.purchase_group) add(`card use on ${u.card_id}`, u.person_id ?? "me", u.used_on, u.amount);
  for (const r of data.repayments) add(`repayment (${r.applies_to})`, r.person_id, r.paid_on, r.amount);
  for (const g of groups.values()) if (g.n > 1) {
    const kind = g.kind.startsWith("card use") ? "card use" : g.kind;
    out.push({ id: `dup:${g.kind}:${g.who}:${g.iso}:${g.amount}`, severity: "medium", kind: "Duplicate-looking",
      title: `${g.n} identical ${kind} entries`, detail: `${g.who === "me" ? "You" : name.get(g.who) ?? "Unknown"} · ${fmt(g.amount)} on ${g.iso}. If it was entered twice, delete one.`, href: g.who !== "me" ? `/debtors/${g.who}` : undefined });
  }

  // 2. Payments exceeding what was owed, per source (loans; each card).
  for (const p of data.people) {
    const loanTaken = sumBy(data.loans.filter((l) => l.person_id === p.id), (l) => l.amount);
    const loanPaid = sumBy(data.repayments.filter((r) => r.person_id === p.id && r.applies_to === "loan"), (r) => r.amount);
    if (loanPaid > loanTaken) out.push({ id: `over:loan:${p.id}`, severity: "high", kind: "Overpayment", title: `${p.name} repaid more than they borrowed on loans`,
      detail: `Loans ${fmt(loanTaken)}, loan repayments ${fmt(loanPaid)} (${fmt(subMoney(loanPaid, loanTaken))} over). A repayment may be filed under the wrong source.`, href: `/debtors/${p.id}` });
    for (const c of data.cards) {
      const used = sumBy(data.cardUses.filter((u) => u.person_id === p.id && u.card_id === c.id), owedOf);
      const paid = sumBy(data.repayments.filter((r) => r.person_id === p.id && r.applies_to === "card" && r.card_id === c.id), (r) => r.amount);
      if (paid > used) out.push({ id: `over:card:${p.id}:${c.id}`, severity: "high", kind: "Overpayment", title: `${p.name} repaid more than they owed on a card`,
        detail: `Owed ${fmt(used)}, repaid ${fmt(paid)} on this card (${fmt(subMoney(paid, used))} over).`, href: `/debtors/${p.id}` });
    }
  }

  // 3. Inconsistent balances: others owe more on a card than the card's whole balance.
  for (const c of d.cards) if (c.myShare < 0) out.push({ id: `bal:${c.card.id}`, severity: "medium", kind: "Inconsistent balance",
    title: `${c.label}: others owe more than the card balance`, detail: `Card balance ${fmt(c.balance)}, others owe ${fmt(c.othersOwe)}. The card balance is probably out of date.`, href: `/cards/${c.card.slot}` });

  // 4. Overlapping EMI records: the same person, card, amount and tenure starting on the same date.
  const emi = new Map<string, number>();
  for (const u of data.cardUses) if (u.pay_plan === "emi" && u.person_id) {
    const k = `${u.person_id}|${u.card_id}|${u.amount}|${u.emi_months}|${u.due_on}`;
    emi.set(k, (emi.get(k) ?? 0) + 1);
  }
  for (const [k, n] of emi) if (n > 1) {
    const [pid, , amount, months, due] = k.split("|");
    out.push({ id: `emi:${k}`, severity: "high", kind: "Overlapping EMI", title: `${n} identical EMI plans for ${name.get(pid)}`,
      detail: `${fmt(Number(amount))} over ${months} months from ${due} appears ${n} times — their installments would be counted ${n}×.`, href: `/debtors/${pid}` });
  }

  // 5. Missing fields that make tracking impossible.
  const noDue = d.open.filter((o) => o.status === "undated");
  if (noDue.length) out.push({ id: "nodue", severity: "low", kind: "Missing details", title: `${noDue.length} outstanding ${noDue.length === 1 ? "amount has" : "amounts have"} no due date`,
    detail: `${fmt(sumBy(noDue, (o) => o.left))} can't be shown as due or late (${[...new Set(noDue.map((o) => o.name))].slice(0, 3).join(", ")}).` });

  // 6. Unusual date sequences.
  for (const l of data.loans) {
    if (l.due_on && l.due_on < l.taken_on) out.push({ id: `seq:due:${l.id}`, severity: "medium", kind: "Date order", title: "Loan due before it was given",
      detail: `${name.get(l.person_id)}: taken ${l.taken_on}, due ${l.due_on}.`, href: `/debtors/${l.person_id}` });
  }
  for (const u of data.cardUses) if (u.pay_plan === "emi" && u.due_on && u.due_on < u.used_on) out.push({ id: `seq:emi:${u.id}`, severity: "medium", kind: "Date order",
    title: "EMI starts before the purchase", detail: `${u.person_id ? name.get(u.person_id) : "You"}: bought ${u.used_on}, first installment ${u.due_on}.` });
  const future = [...data.loans.map((l) => ({ iso: l.taken_on, what: "loan", who: l.person_id })), ...data.cardUses.map((u) => ({ iso: u.used_on, what: "card use", who: u.person_id })),
    ...data.repayments.map((r) => ({ iso: r.paid_on, what: "repayment", who: r.person_id }))].filter((x) => x.iso > today);
  if (future.length) out.push({ id: "future", severity: "medium", kind: "Date order", title: `${future.length} ${future.length === 1 ? "entry is" : "entries are"} dated in the future`,
    detail: future.slice(0, 3).map((f) => `${f.what} ${f.iso}${f.who ? ` (${name.get(f.who)})` : ""}`).join(", ") + "." });
  for (const p of data.people) {
    const firstOut = [...data.loans.filter((l) => l.person_id === p.id).map((l) => l.taken_on), ...data.cardUses.filter((u) => u.person_id === p.id).map((u) => u.used_on)].sort()[0];
    const firstIn = data.repayments.filter((r) => r.person_id === p.id).map((r) => r.paid_on).sort()[0];
    if (firstIn && (!firstOut || firstIn < firstOut)) out.push({ id: `seq:rep:${p.id}`, severity: "low", kind: "Date order", title: `${p.name} repaid before borrowing`,
      detail: firstOut ? `First repayment ${firstIn}, first borrowing ${firstOut}.` : `A repayment on ${firstIn} but nothing borrowed.`, href: `/debtors/${p.id}` });
  }

  // 7. Possible duplicate people.
  for (const [a, b] of similarNames(data.people.map((p) => p.name))) out.push({ id: `name:${a}:${b}`, severity: "low", kind: "Possible duplicate person",
    title: `“${a}” and “${b}”`, detail: "These names differ by one letter. If they're one person, their records are split across two profiles." });

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
}
