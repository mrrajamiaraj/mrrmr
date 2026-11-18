import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AuditRow = { id: number; at: string; action: "insert" | "update" | "delete"; table_name: string; row_id: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null };
export type Adjustment = { id: string; target: "account" | "card"; target_id: string; recorded: number; statement: number; delta: number; statement_date: string; note: string | null; created_at: string };

const missing = (e: { code?: string; message: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /could not find the table|does not exist/i.test(e.message));

/** Audit trail + adjustments (migration 0011). RLS: owner reads own rows; the viewer reads none. */
export async function loadAudit(limit = 200): Promise<{ ready: boolean; audit: AuditRow[]; adjustments: Adjustment[] }> {
  const supabase = await createClient();
  const [a, b] = await Promise.all([
    supabase.from("audit_log").select("id,at,action,table_name,row_id,before,after").order("at", { ascending: false }).limit(limit),
    supabase.from("balance_adjustments").select("*").order("created_at", { ascending: false }).limit(100),
  ]);
  if (missing(a.error) || missing(b.error)) return { ready: false, audit: [], adjustments: [] };
  if (a.error || b.error) throw new Error(`Could not load the audit trail: ${(a.error ?? b.error)!.message}`);
  return {
    ready: true,
    audit: (a.data ?? []) as AuditRow[],
    adjustments: (b.data ?? []).map((r) => ({ ...r, recorded: Number(r.recorded), statement: Number(r.statement), delta: Number(r.delta) })) as Adjustment[],
  };
}
