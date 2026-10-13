import { loadFinance } from "@/lib/data";
import { loadResearch } from "@/lib/research-data";
import { todayIso } from "@/lib/format";
import { cardLabel } from "@/lib/ledger";

export const dynamic = "force-dynamic";

function cell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV with every record, for personal backups. The proxy already requires a signed-in user. */
export async function GET() {
  const [d, research] = await Promise.all([loadFinance(), loadResearch()]);
  const person = new Map(d.people.map((p) => [p.id, p.name]));
  const card = new Map(d.cards.map((c) => [c.id, `${cardLabel(c)} · ${c.name}`]));
  const account = new Map(d.accounts.map((a) => [a.id, a.name]));

  const header = ["record_type", "date", "person", "amount", "reason_or_place", "method_or_via", "category_or_applies_to", "account", "card", "due_on", "notes", "id"];
  const rows: unknown[][] = [
    ...d.accounts.map((a) => ["account", a.updated_at.slice(0, 10), a.holder_name, a.balance, a.name, "", "", a.name, "", "", "balance", a.id]),
    ...d.cards.map((c) => ["card", c.updated_at.slice(0, 10), "", c.balance, `${c.bank} ${c.name}`, c.network, `limit ${c.credit_limit ?? ""}`, "", card.get(c.id), c.pay_by, `last4 ${c.last4 ?? ""}`, c.id]),
    ...d.people.map((p) => ["person", "", p.name, "", "", "", p.relation, "", "", "", [p.phone, p.notes].filter(Boolean).join(" · "), p.id]),
    ...d.loans.map((l) => ["loan", l.taken_on, person.get(l.person_id), l.amount, l.reason, l.method, "", account.get(l.account_id ?? ""), "", l.due_on, "", l.id]),
    ...d.cardUses.map((u) => ["card_use", u.used_on, u.person_id ? person.get(u.person_id) : "Me", u.amount, u.reason_or_place, "", u.category, "", card.get(u.card_id), u.due_on, "", u.id]),
    ...d.repayments.map((r) => ["repayment", r.paid_on, person.get(r.person_id), r.amount, "", r.via, r.applies_to, account.get(r.account_id ?? ""), r.card_id ? card.get(r.card_id) : "", "", "", r.id]),
    ...research.expenses.map((e) => ["research_expense", e.spent_on, e.member, e.amount, e.description, "", e.facility, "", "", "", e.tag, e.id]),
    ...research.contributions.map((c) => ["research_contribution", c.paid_on, c.member, c.amount, "", c.note, "", "", "", "", "", c.id]),
  ];

  // BOM so Excel opens the ৳ sign and Bangla names correctly.
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finance-backup-${todayIso()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
