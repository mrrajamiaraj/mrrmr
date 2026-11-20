import { loadFinance } from "@/lib/data";
import { loadResearch } from "@/lib/research-data";
import { todayIso } from "@/lib/format";
import { cardLabel } from "@/lib/ledger";
import { cardTransactions, debtorStatement, emiSchedules, type Table } from "@/lib/exports";
import { csvCell as cell } from "@/lib/security";
import { exportGuard } from "@/lib/export-guard";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

function csv(t: Table) {
  // BOM so Excel opens the ৳ sign and Bangla names correctly; every cell is quoted/defused by csvCell.
  return "﻿" + [t.header, ...t.rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

function file(t: Table) {
  return new Response(csv(t), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${t.name}-${todayIso()}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Admin exports. exportGuard() refuses view mode and signed-out callers in the route itself (the proxy does too), and
 * the data loaders are RLS-scoped, so a viewer session could never read finance rows here anyway.
 *   /export                         full backup (every record, finance + research)
 *   /export?type=debtor&id=<uuid>   one debtor's statement with running balance
 *   /export?type=card&slot=1|2[&from&to]  one card's purchases and repayments
 *   /export?type=emi                every EMI installment on every card
 */
export async function GET(request: Request) {
  // Admin only, checked here (not only in the proxy), plus a per-user rate limit.
  const refused = await exportGuard("admin");
  if (refused) return refused;
  const q = new URL(request.url).searchParams;
  const type = q.get("type") ?? "full";
  const from = q.get("from") ?? "", to = q.get("to") ?? "";
  if ((from && !ISO.test(from)) || (to && !ISO.test(to))) return new Response("Dates must be YYYY-MM-DD.", { status: 400 });

  if (type === "debtor") {
    const id = q.get("id") ?? "";
    if (!UUID.test(id)) return new Response("Unknown debtor.", { status: 400 });
    const t = debtorStatement(await loadFinance(), id, todayIso());
    return t ? file(t) : new Response("Unknown debtor.", { status: 404 });
  }
  if (type === "card") {
    const slot = Number(q.get("slot"));
    if (slot !== 1 && slot !== 2) return new Response("Unknown card.", { status: 400 });
    const t = cardTransactions(await loadFinance(), slot, from, to);
    return t ? file(t) : new Response("Unknown card.", { status: 404 });
  }
  if (type === "emi") return file(emiSchedules(await loadFinance()));
  if (type !== "full") return new Response("Unknown export type.", { status: 400 });

  const [d, research] = await Promise.all([loadFinance(), loadResearch()]);
  const person = new Map(d.people.map((p) => [p.id, p.name]));
  const card = new Map(d.cards.map((c) => [c.id, `${cardLabel(c)} · ${c.name}`]));
  const account = new Map(d.accounts.map((a) => [a.id, a.name]));
  return file({
    name: "finance-backup",
    header: ["record_type", "date", "person", "amount", "reason_or_place", "method_or_via", "category_or_applies_to", "account", "card", "due_on", "notes", "id"],
    rows: [
      ...d.accounts.map((a) => ["account", a.updated_at.slice(0, 10), a.holder_name, a.balance, a.name, "", "", a.name, "", "", `balance; debit_used ${a.debit_used}`, a.id]),
      ...d.cards.map((c) => ["card", c.updated_at.slice(0, 10), "", c.balance, `${c.bank} ${c.name}`, c.network, `limit ${c.credit_limit ?? ""}`, "", card.get(c.id), c.pay_by, `last4 ${c.last4 ?? ""}`, c.id]),
      ...d.people.map((p) => ["person", "", p.name, "", "", "", p.relation, "", "", "", [p.phone, p.notes].filter(Boolean).join(" · "), p.id]),
      ...d.loans.map((l) => ["loan", l.taken_on, person.get(l.person_id), l.amount, l.reason, l.method, "", account.get(l.account_id ?? ""), "", l.due_on, "", l.id]),
      ...d.cardUses.map((u) => ["card_use", u.used_on, u.person_id ? person.get(u.person_id) : "Me", u.amount, u.reason_or_place, u.pay_plan === "emi" ? `EMI ${u.emi_months}` : "full", u.category, "", card.get(u.card_id), u.due_on, [u.emi_charges ? `emi_charges ${u.emi_charges}` : "", u.purchase_group ? `split ${u.purchase_group}` : ""].filter(Boolean).join("; "), u.id]),
      ...d.repayments.map((r) => ["repayment", r.paid_on, person.get(r.person_id), r.amount, "", r.via, r.applies_to, account.get(r.account_id ?? ""), r.card_id ? card.get(r.card_id) : "", "", "", r.id]),
      ...research.expenses.map((e) => ["research_expense", e.spent_on, e.member, e.amount, e.description, "", e.facility, "", "", "", e.tag, e.id]),
      ...research.contributions.map((c) => ["research_contribution", c.paid_on, c.member, c.amount, "", c.note, "", "", "", "", "", c.id]),
    ],
  });
}
