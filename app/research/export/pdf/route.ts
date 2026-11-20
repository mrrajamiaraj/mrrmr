import { loadResearch } from "@/lib/research-data";
import { DEFAULT_FACILITIES, DEFAULT_MEMBERS, mergeNames } from "@/lib/research";
import { RESEARCH_SECTIONS, renderResearchPdf, researchPdfName, type ResearchSection } from "@/lib/research-pdf";
import { todayIso } from "@/lib/format";
import { exportGuard, pdfRangeTooLong, pdfTooBig } from "@/lib/export-guard";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;

/**
 * GET /research/export/pdf?section=expenses|contributions|settlement|facilities|monthly|all[&from][&to]
 *   expenses also takes the list's filters: &fac= &mem= &month=YYYY-MM &day=YYYY-MM-DD &q=
 *
 * Access matches the research CSV: it reads only the two research tables (which view mode may read), and the proxy
 * already limits view mode to /research. Same date range as the page, so the PDF matches what's on screen.
 */
export async function GET(request: Request) {
  const refused = await exportGuard("research");
  if (refused) return refused;
  const p = new URL(request.url).searchParams;
  const section = (p.get("section") ?? "all") as ResearchSection;
  if (!RESEARCH_SECTIONS.includes(section)) return new Response("Unknown section.", { status: 400 });
  const from = p.get("from") || null, to = p.get("to") || null;
  if ((from && !ISO.test(from)) || (to && !ISO.test(to))) return new Response("Dates must be YYYY-MM-DD.", { status: 400 });
  if (from && to && from > to) return new Response("The start date is after the end date.", { status: 400 });
  if (pdfRangeTooLong(from, to)) return new Response("Pick a date range of 10 years or less.", { status: 400 });
  const month = p.get("month") || "", day = p.get("day") || "";
  if ((month && !YM.test(month)) || (day && !ISO.test(day))) return new Response("Bad month or day filter.", { status: 400 });
  const text = (k: string) => (p.get(k) ?? "").slice(0, 120);

  const r = await loadResearch();
  if (r.missingTables) return new Response("The research tables haven't been set up yet.", { status: 409 });
  const inRange = (iso: string) => (!from || iso >= from) && (!to || iso <= to);
  const today = todayIso();
  const pdf = await renderResearchPdf(section, {
    expenses: r.expenses.filter((e) => inRange(e.spent_on)),
    contributions: r.contributions.filter((c) => inRange(c.paid_on)),
    facilities: mergeNames(DEFAULT_FACILITIES, r.expenses.map((e) => e.facility)),
    members: mergeNames(DEFAULT_MEMBERS, [...r.expenses.map((e) => e.member), ...r.contributions.map((c) => c.member)]),
    from, to, generatedOn: today,
    filter: section === "expenses" ? { fac: text("fac"), mem: text("mem"), month, day, q: text("q") } : undefined,
  });

  const big = pdfTooBig(pdf.bytes);
  if (big) return big;
  return new Response(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${researchPdfName(section, from, to, today)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
