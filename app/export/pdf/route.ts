import { loadFinance } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { buildProfiles } from "@/lib/ledger";
import { buildStatement } from "@/lib/statement";
import { renderEveryonePdf, renderStatementPdf } from "@/lib/pdf";
import { isIsoDate, isUuid } from "@/lib/validate";
import { exportGuard, pdfRangeTooLong, pdfTooBig } from "@/lib/export-guard";

export const dynamic = "force-dynamic";

/**
 * GET /export/pdf?id=<person uuid>[&from=YYYY-MM-DD][&to=YYYY-MM-DD] → that person's statement as an A4 PDF.
 * GET /export/pdf?all=1[&from][&to] → everyone: a summary page, then each person's statement (renderEveryonePdf).
 *
 * Access: ADMIN ONLY (decision 2026-11-19; the brief left PDF access undefined, so it defaults to admin). View mode is
 * refused here (writer() rejects the viewer before any query) as well as by the proxy, and the data itself is
 * RLS-scoped to the signed-in owner. Only the requested person's rows are put in the file.
 */
export async function GET(request: Request) {
  // Admin only (view mode and signed-out callers refused here, not only in the proxy), aal2 if MFA is on, rate limited.
  const refused = await exportGuard("admin");
  if (refused) return refused;

  const q = new URL(request.url).searchParams;
  const id = q.get("id") ?? "";
  const all = q.get("all") === "1";
  const from = q.get("from") || null, to = q.get("to") || null;
  if (!all && !isUuid(id)) return new Response("Unknown person.", { status: 400 });
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return new Response("Dates must be real dates (YYYY-MM-DD).", { status: 400 });
  if (from && to && from > to) return new Response("The start date is after the end date.", { status: 400 });
  if (pdfRangeTooLong(from, to)) return new Response("Pick a date range of 10 years or less.", { status: 400 });

  const today = todayIso();
  const data = await loadFinance();

  if (all) {
    const profiles = buildProfiles(data, today);
    const items = [...data.people]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((person) => {
        const s = buildStatement(data, person.id, today, { from, to });
        const p = profiles.find((x) => x.id === person.id);
        return s ? { s, outstandingNow: p?.owes, nextDue: p?.due ?? null } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    const pdf = await renderEveryonePdf(items, today, { from, to });
    const big = pdfTooBig(pdf.bytes, pdf.pageCount);
    if (big) return big;
    const file = `MRRMR-statements-everyone-${from ?? "start"}-to-${to ?? today}.pdf`;
    return new Response(Buffer.from(pdf.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const s = buildStatement(data, id, today, { from, to });
  if (!s) return new Response("Unknown person.", { status: 404 });
  const p = buildProfiles(data, today).find((x) => x.id === id);
  const pdf = await renderStatementPdf(s, { outstandingNow: p?.owes, nextDue: p?.due ?? null });
  const big = pdfTooBig(pdf.bytes, pdf.pageCount);
  if (big) return big;

  return new Response(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${s.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
