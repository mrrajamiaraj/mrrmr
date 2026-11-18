import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FinanceData } from "@/lib/types";

// numeric columns can arrive as strings depending on PostgREST settings; normalise them.
function nums<T extends Record<string, unknown>>(rows: T[] | null, keys: (keyof T)[]): T[] {
  return (rows ?? []).map((r) => {
    const out = { ...r };
    for (const k of keys) if (out[k] != null) (out[k] as unknown) = Number(out[k]);
    return out;
  });
}

/** Everything the dashboard needs. A personal ledger is small, so one load per page is fine. */
export async function loadFinance(): Promise<FinanceData> {
  const supabase = await createClient();
  const [accounts, cards, people, loans, cardUses, repayments, summary] = await Promise.all([
    supabase.from("accounts").select("id,name,holder_name,balance,debit_used,updated_at").order("created_at"),
    supabase.from("cards").select("id,slot,bank,name,network,last4,credit_limit,balance,pay_by,updated_at").order("slot"),
    supabase.from("people").select("id,name,relation,phone,notes").order("name"),
    supabase.from("loans").select("*").order("taken_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("card_uses").select("*").order("used_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("repayments").select("*").order("paid_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("debtor_summary").select("*"),
  ]);

  const firstError = [accounts, cards, people, loans, cardUses, repayments, summary].find((r) => r.error)?.error;
  if (firstError) throw new Error(`Could not load data from Supabase: ${firstError.message}`);

  return {
    accounts: nums(accounts.data, ["balance", "debit_used"]),
    cards: nums(cards.data, ["balance", "credit_limit", "slot"]),
    people: people.data ?? [],
    loans: nums(loans.data, ["amount"]),
    cardUses: nums(cardUses.data, ["amount", "emi_charges"]),
    repayments: nums(repayments.data, ["amount"]),
    summary: nums(summary.data, [
      "loaned", "loan_count", "card_used", "card_use_count", "repaid", "repaid_loan",
      "repaid_card", "repayment_count", "still_owes",
    ]),
  } as FinanceData;
}
