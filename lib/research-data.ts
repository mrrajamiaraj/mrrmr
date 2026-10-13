import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ResearchData } from "@/lib/research";

const isMissingTable = (e: { code?: string; message: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /could not find the table|does not exist/i.test(e.message));

export async function loadResearch(): Promise<ResearchData> {
  const supabase = await createClient();
  const [exp, con] = await Promise.all([
    supabase.from("research_expenses").select("*").order("spent_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("research_contributions").select("*").order("paid_on", { ascending: true }).order("created_at", { ascending: true }),
  ]);
  if (isMissingTable(exp.error) || isMissingTable(con.error)) return { expenses: [], contributions: [], missingTables: true };
  const err = exp.error ?? con.error;
  if (err) throw new Error(`Could not load research data from Supabase: ${err.message}`);

  return {
    expenses: (exp.data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })),
    contributions: (con.data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })),
    missingTables: false,
  };
}
