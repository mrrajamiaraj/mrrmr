// Research ledger PDFs: each section on its own (Expenses, Contributions, Settlement, By facility & member, By month)
// or all of them in one report. Every figure comes from lib/research-stats (exact, tested) — the same functions the
// page uses — so a PDF always matches the screen. Amounts as "BDT 1,43,345.00" (the standard PDF font has no Taka sign).
// Relative imports so Node's test runner can load this file. Tested in tests/research-pdf.test.mjs.
import { renderReportPdf, type Report, type ReportCell, type ReportTable } from "./pdf-table.ts";
import { bdt } from "./statement.ts";
import { dateLong, monthLabel } from "./format.ts";
import { subMoney, sumBy } from "./money.ts";
import { breakdown, filterExpenses, matrix, memberBalances, monthlyFlow, RESEARCH_SECTIONS, SECTION_TITLE, type ExpenseFilter, type ResearchSection } from "./research-stats.ts";
import type { ResearchContribution, ResearchExpense } from "./research.ts";

export { RESEARCH_SECTIONS, SECTION_TITLE, type ResearchSection };

const money = (n: number) => `BDT ${bdt(n)}`;
const signedMoney = (n: number) => `${n < 0 ? "-" : n > 0 ? "+" : ""}BDT ${bdt(n)}`;
const toneOf = (n: number): "bad" | "good" => (n < 0 ? "bad" : "good");

export type ResearchPdfInput = {
  expenses: ResearchExpense[];
  contributions: ResearchContribution[];
  facilities: string[];
  members: string[];
  from: string | null;
  to: string | null;
  generatedOn: string;
  /** Expenses section only: the same filters as the page's list */
  filter?: ExpenseFilter;
};

function filterText(f: ExpenseFilter | undefined) {
  if (!f) return "";
  const parts = [f.fac && `facility ${f.fac}`, f.mem && `paid by ${f.mem}`, f.month && monthLabel(f.month), f.day && dateLong(f.day), f.q && `matching "${f.q}"`].filter(Boolean);
  return parts.length ? `Showing only: ${parts.join(", ")}` : "";
}

function expensesTable(rows: ResearchExpense[]): ReportTable {
  const sorted = [...rows].sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at));
  return {
    heading: "Expenses", note: `${rows.length} ${rows.length === 1 ? "expense" : "expenses"}, newest first.`,
    columns: [{ label: "Date", w: 1.2 }, { label: "Facility", w: 1.3 }, { label: "Paid by", w: 1.1 }, { label: "Description", w: 2.6 }, { label: "Tag", w: 1.1 }, { label: "Amount", w: 1.3, right: true }],
    rows: sorted.map((e) => [dateLong(e.spent_on), e.facility, e.member, e.description, e.tag ?? "", money(e.amount)]),
    totals: ["Total", "", "", "", "", money(sumBy(rows, (e) => e.amount))],
    empty: "No expenses in this period.",
  };
}

function contributionsTable(rows: ResearchContribution[]): ReportTable {
  const sorted = [...rows].sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at));
  return {
    heading: "Contributions", note: `${rows.length} member ${rows.length === 1 ? "payment" : "payments"}, newest first.`,
    columns: [{ label: "Date", w: 1.3 }, { label: "Member", w: 1.6 }, { label: "Notes & reference", w: 3 }, { label: "Amount", w: 1.4, right: true }],
    rows: sorted.map((c) => [dateLong(c.paid_on), c.member, c.note ?? "", money(c.amount)]),
    totals: ["Total", "", "", money(sumBy(rows, (c) => c.amount))],
    empty: "No contributions in this period.",
  };
}

function settlementTable(i: ResearchPdfInput): ReportTable {
  const rows = memberBalances(i.expenses, i.contributions, i.members);
  return {
    heading: "Settlement", note: "Each member's net is what they put in minus what they paid for.",
    columns: [{ label: "Member", w: 1.6 }, { label: "Payments", w: 0.9, right: true }, { label: "Contributed", w: 1.4, right: true }, { label: "Paid for", w: 1.4, right: true }, { label: "Net", w: 1.4, right: true }, { label: "Share of contributions", w: 1.9, bar: true }],
    rows: rows.map((r) => [r.name, r.logs, money(r.contributed), money(r.spent), { text: signedMoney(r.net), tone: toneOf(r.net) }, r.share]),
    totals: ["Total", sumBy(rows, (r) => r.logs), money(sumBy(rows, (r) => r.contributed)), money(sumBy(rows, (r) => r.spent)),
      { text: signedMoney(subMoney(sumBy(rows, (r) => r.contributed), sumBy(rows, (r) => r.spent))), tone: toneOf(subMoney(sumBy(rows, (r) => r.contributed), sumBy(rows, (r) => r.spent))) }, ""],
  };
}

function breakdownTables(i: ResearchPdfInput): ReportTable[] {
  const cols = (label: string) => [{ label, w: 1.8 }, { label: "Entries", w: 0.9, right: true }, { label: "Average", w: 1.3, right: true }, { label: "Total", w: 1.4, right: true }, { label: "Share", w: 2 , bar: true }];
  const row = (s: ReturnType<typeof breakdown>[number]): ReportCell[] => [s.name, s.count, money(s.avg), money(s.total), s.share];
  const byFac = breakdown(i.expenses, (e) => e.facility, (e) => e.amount, i.facilities);
  const byMem = breakdown(i.expenses, (e) => e.member, (e) => e.amount, i.members);
  const total = money(sumBy(i.expenses, (e) => e.amount));
  const f = byFac.map((s) => s.name), m = byMem.map((s) => s.name);
  const grid = matrix(i.expenses, f, m);
  return [
    { heading: "By facility", note: "Where the research money was spent.", columns: cols("Facility"), rows: byFac.map(row), totals: ["Total", i.expenses.length, "", total, ""], empty: "No expenses in this period." },
    { heading: "By member", note: "Who paid for the expenses.", columns: cols("Member"), rows: byMem.map(row), totals: ["Total", i.expenses.length, "", total, ""], empty: "No expenses in this period." },
    {
      heading: "Facility × member", note: "Who paid for what, where.",
      columns: [{ label: "Facility", w: 1.6 }, ...m.map((name) => ({ label: name, w: 1.2, right: true })), { label: "Total", w: 1.3, right: true }],
      rows: f.map((fac) => [fac, ...m.map((mem) => { const c = grid.cells.find((x) => x.facility === fac && x.member === mem); return c?.total ? money(c.total) : "-"; }), money(byFac.find((s) => s.name === fac)?.total ?? 0)]),
      totals: ["Total", ...m.map((mem) => money(byMem.find((s) => s.name === mem)?.total ?? 0)), total],
      empty: "No expenses in this period.",
    },
  ];
}

function monthlyTable(i: ResearchPdfInput): ReportTable {
  const flow = monthlyFlow(i.expenses, i.contributions);
  return {
    heading: "By month", note: "Spent and contributed each month; running balance = contributed - spent from the first month shown.",
    columns: [{ label: "Month", w: 1.3 }, { label: "Expenses", w: 0.9, right: true }, { label: "Spent", w: 1.4, right: true }, { label: "Contributed", w: 1.4, right: true }, { label: "Month net", w: 1.4, right: true }, { label: "Running", w: 1.4, right: true }],
    rows: flow.map((m) => [monthLabel(m.key), m.count, money(m.spent), money(m.contributed), { text: signedMoney(m.net), tone: toneOf(m.net) }, { text: signedMoney(m.running), tone: toneOf(m.running) }]),
    totals: ["Total", sumBy(flow, (m) => m.count), money(sumBy(flow, (m) => m.spent)), money(sumBy(flow, (m) => m.contributed)), "", { text: signedMoney(flow.at(-1)?.running ?? 0), tone: toneOf(flow.at(-1)?.running ?? 0) }],
    empty: "Nothing recorded in this period.",
  };
}

/** Builds the report for one section (or "all"). Pure: data in, report description out. */
export function buildResearchReport(section: ResearchSection, i: ResearchPdfInput): Report {
  const period = !i.from && !i.to ? "All dates" : `${i.from ? dateLong(i.from) : "First record"} to ${dateLong(i.to ?? i.generatedOn)}`;
  const spent = sumBy(i.expenses, (e) => e.amount);
  const con = sumBy(i.contributions, (c) => c.amount);
  const net = subMoney(con, spent);
  const base = {
    eyebrow: "Research ledger", generatedOn: i.generatedOn,
    footer: `Generated by MRRMR on ${dateLong(i.generatedOn)}. Team research money only - separate from personal bank, cards and loans.`,
  };
  const lines = (extra = "") => [`Period: ${period}`, `Exported: ${dateLong(i.generatedOn)}  ·  Amounts in Bangladeshi Taka (BDT)`, ...(extra ? [extra] : [])];
  const overview = [
    { label: "Spent", value: money(spent) },
    { label: "Contributed", value: money(con), tone: "good" as const },
    { label: net < 0 ? "Short by" : "Left over", value: money(net), tone: toneOf(net) },
    { label: "Covered", value: `${spent ? Math.round((con / spent) * 100) : con ? 100 : 0}%` },
  ];

  if (section === "expenses") {
    const rows = filterExpenses(i.expenses, i.filter ?? {}, dateLong);
    const total = sumBy(rows, (e) => e.amount);
    return { ...base, title: "Expenses", lines: lines(filterText(i.filter)), tables: [expensesTable(rows)],
      boxes: [{ label: "Total", value: money(total), tone: "owed" }, { label: "Expenses", value: String(rows.length) },
        { label: "Average", value: money(rows.length ? Math.round((total / rows.length) * 100) / 100 : 0) }, { label: "Largest", value: money(rows.reduce((m, e) => Math.max(m, e.amount), 0)) }] };
  }
  if (section === "contributions") {
    return { ...base, title: "Contributions", lines: lines(), tables: [contributionsTable(i.contributions)],
      boxes: [{ label: "Total", value: money(con), tone: "good" }, { label: "Payments", value: String(i.contributions.length) },
        { label: "Members", value: String(new Set(i.contributions.map((c) => c.member)).size) }, { label: "Average", value: money(i.contributions.length ? Math.round((con / i.contributions.length) * 100) / 100 : 0) }] };
  }
  if (section === "settlement") return { ...base, title: "Settlement", lines: lines(), boxes: overview, tables: [settlementTable(i)] };
  if (section === "facilities") return { ...base, title: "By facility & member", lines: lines(), boxes: overview, tables: breakdownTables(i) };
  if (section === "monthly") return { ...base, title: "By month", lines: lines(), boxes: overview, tables: [monthlyTable(i)] };
  return {
    ...base, title: "Full report", lines: lines(), boxes: overview,
    tables: [settlementTable(i), monthlyTable(i), ...breakdownTables(i), expensesTable(i.expenses), contributionsTable(i.contributions)],
  };
}

export async function renderResearchPdf(section: ResearchSection, input: ResearchPdfInput) {
  return renderReportPdf(buildResearchReport(section, input));
}

export function researchPdfName(section: ResearchSection, from: string | null, to: string | null, today: string) {
  const range = from || to ? `-${from ?? "start"}-to-${to ?? today}` : "";
  return `MRRMR-research-${section}${range}-${today}.pdf`;
}
