import { loadResearch } from "@/lib/research-data";
import { todayIso } from "@/lib/format";
import { csvCell as cell } from "@/lib/security";
import { exportGuard } from "@/lib/export-guard";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Research ledger CSV (optionally ?from=YYYY-MM-DD&to=YYYY-MM-DD). The only export view mode may download: it reads
 * nothing but the two research tables, which the database already lets the viewer read (and nothing else).
 */
export async function GET(request: Request) {
  // Admin or view mode, checked in the route itself, plus a per-user rate limit.
  const refused = await exportGuard("research");
  if (refused) return refused;
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if ((from && !ISO.test(from)) || (to && !ISO.test(to))) return new Response("Dates must be YYYY-MM-DD.", { status: 400 });
  const inRange = (iso: string) => (!from || iso >= from) && (!to || iso <= to);

  const r = await loadResearch();
  const rows: unknown[][] = [
    ...r.expenses.filter((e) => inRange(e.spent_on)).map((e) => ["expense", e.spent_on, e.member, e.facility, e.description, e.tag, e.amount, e.id]),
    ...r.contributions.filter((c) => inRange(c.paid_on)).map((c) => ["contribution", c.paid_on, c.member, "", c.note, "", c.amount, c.id]),
  ];
  const header = ["record_type", "date", "member", "facility", "description_or_note", "tag", "amount", "id"];
  const csv = "﻿" + [header, ...rows].map((x) => x.map(cell).join(",")).join("\r\n");
  const range = from || to ? `-${from || "start"}-to-${to || todayIso()}` : "";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="research-ledger${range}-${todayIso()}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
