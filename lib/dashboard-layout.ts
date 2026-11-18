// Overview dashboard layout: which sections show, in what order. Stored per user in Supabase Auth user metadata
// (`dashboard_layout`), so it follows the admin across devices. Not a "use server" file, so it can export constants.

export const SECTIONS = [
  { id: "insights", label: "Smart insights", hint: "Deterministic observations from your ledger" },
  { id: "snapshot", label: "Financial snapshot", hint: "Bank, cards, loans, collections, obligations" },
  { id: "cashflow", label: "Cash movement", hint: "Lent vs recovered, by month or year" },
  { id: "receivables", label: "Receivables", hint: "Outstanding, due soon, overdue, largest" },
  { id: "cards", label: "Credit cards", hint: "Each card's balance, share split and EMIs" },
  { id: "activity", label: "Activity", hint: "Every loan, card use and repayment" },
  { id: "bank", label: "City Bank details", hint: "Balance editor, debit card, loans table, outlook" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
export type DashboardLayout = { order: SectionId[]; hidden: SectionId[] };

export const DEFAULT_LAYOUT: DashboardLayout = { order: SECTIONS.map((s) => s.id), hidden: [] };

const IDS = new Set<string>(SECTIONS.map((s) => s.id));

/** Accepts anything (stored metadata, client input) and returns a valid layout: known ids only, each once, none lost. */
export function normalizeLayout(raw: unknown): DashboardLayout {
  const r = (raw && typeof raw === "object" ? raw : {}) as { order?: unknown; hidden?: unknown };
  const order = (Array.isArray(r.order) ? r.order : []).filter((x): x is SectionId => typeof x === "string" && IDS.has(x));
  const seen = [...new Set(order)];
  for (const s of SECTIONS) if (!seen.includes(s.id)) seen.push(s.id); // new sections appear, nothing disappears
  const hidden = [...new Set((Array.isArray(r.hidden) ? r.hidden : []).filter((x): x is SectionId => typeof x === "string" && IDS.has(x)))];
  return { order: seen, hidden };
}
