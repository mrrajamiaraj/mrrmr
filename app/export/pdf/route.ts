import { loadFinance } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { buildProfiles } from "@/lib/ledger";
import { buildStatement } from "@/lib/statement";
import { renderStatementPdf } from "@/lib/pdf";
import { writer } from "@/lib/viewer";
import { isIsoDate, isUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * GET /export/pdf?id=<person uuid>[&from=YYYY-MM-DD][&to=YYYY-MM-DD] → that person's statement as an A4 PDF.
 *
 * Access: ADMIN ONLY (decision 2026-11-19; the brief left PDF access undefined, so it defaults to admin). View mode is
 * refused here (writer() rejects the viewer before any query) as well as by the proxy, and the data itself is
 * RLS-scoped to the signed-in owner. Only the requested person's rows are put in the file.
 */
export async function GET(request: Request) {
  try { await writer(); } catch { return new Response("Statements are available to the admin only.", { status: 403 }); }

  const q = new URL(request.url).searchParams;
  const id = q.get("id") ?? "";
  const from = q.get("from") || null, to = q.get("to") || null;
  if (!isUuid(id)) return new Response("Unknown person.", { status: 400 });
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return new Response("Dates must be real dates (YYYY-MM-DD).", { status: 400 });
  if (from && to && from > to) return new Response("The start date is after the end date.", { status: 400 });

  const today = todayIso();
  const data = await loadFinance();
  const s = buildStatement(data, id, today, { from, to });
  if (!s) return new Response("Unknown person.", { status: 404 });
  const p = buildProfiles(data, today).find((x) => x.id === id);
  const pdf = await renderStatementPdf(s, { outstandingNow: p?.owes, nextDue: p?.due ?? null });

  return new Response(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${s.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
