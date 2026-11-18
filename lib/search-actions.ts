"use server";

import { createClient } from "@/lib/supabase/server";
import { loadFinance } from "@/lib/data";
import { loadResearch } from "@/lib/research-data";
import { isViewerEmail } from "@/lib/viewer";
import { cardLabel, cardPlanStatus } from "@/lib/ledger";
import { dateShort, taka } from "@/lib/format";

export type SearchItem = { id: string; group: "Loans" | "Card transactions" | "EMI plans" | "Research"; label: string; hint: string; href: string };

/**
 * The command palette's record index. Authorization is enforced twice: view mode gets research entries only (checked
 * here from the verified session), and every query is RLS-scoped, so finance rows could not reach a viewer anyway.
 */
export async function searchIndex(): Promise<SearchItem[]> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return [];
  const viewer = isViewerEmail(auth.claims.email as string | undefined);

  const research = await loadResearch();
  const items: SearchItem[] = [
    ...research.expenses.map((e) => ({ id: `re-${e.id}`, group: "Research" as const, label: `${e.facility} — ${e.description}`, hint: `${taka(e.amount)} · ${e.member} · ${dateShort(e.spent_on)}`, href: "/research" })),
    ...research.contributions.map((c) => ({ id: `rc-${c.id}`, group: "Research" as const, label: `Contribution — ${c.member}`, hint: `${taka(c.amount)} · ${dateShort(c.paid_on)}`, href: "/research" })),
  ];
  if (viewer) return items;

  const data = await loadFinance();
  const name = new Map(data.people.map((p) => [p.id, p.name]));
  const slot = new Map(data.cards.map((c) => [c.id, c.slot]));
  items.unshift(
    ...data.loans.map((l) => ({ id: `l-${l.id}`, group: "Loans" as const, label: `${name.get(l.person_id)} — ${l.reason}`, hint: `${taka(l.amount)} · ${dateShort(l.taken_on)}`, href: `/debtors/${l.person_id}` })),
    ...data.cardUses.map((u) => ({ id: `u-${u.id}`, group: "Card transactions" as const, label: `${u.person_id ? name.get(u.person_id) : "Me"} — ${u.reason_or_place}`, hint: `${taka(u.amount)} · ${dateShort(u.used_on)} · ${cardLabel(data.cards.find((c) => c.id === u.card_id))}`, href: `/cards/${slot.get(u.card_id)}` })),
    ...data.cards.flatMap((c) => [...cardPlanStatus(data, c.id).values()].filter((s) => s.plan === "emi").map((s) => ({
      id: `e-${s.useId}`, group: "EMI plans" as const, label: `EMI — ${name.get(s.personId)} · ${s.reason}`, hint: `${s.paidCount}/${s.of} paid · ${taka(s.left)} left`, href: `/cards/${c.slot}`,
    }))),
  );
  return items;
}
