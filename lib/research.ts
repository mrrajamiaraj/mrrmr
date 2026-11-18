export type ResearchExpense = {
  id: string;
  spent_on: string;
  facility: string;
  member: string;
  description: string;
  tag: string | null;
  amount: number;
  created_at: string;
};

export type ResearchContribution = {
  id: string;
  paid_on: string;
  member: string;
  note: string | null;
  amount: number;
  created_at: string;
};

export type ResearchData = {
  expenses: ResearchExpense[];
  contributions: ResearchContribution[];
  /** true until 0003_research_ledger.sql has been run */
  missingTables: boolean;
};

export const DEFAULT_FACILITIES = ["BHS", "NICVD", "United Hospital", "BMRC"];
export const DEFAULT_MEMBERS = ["Raja", "Somik", "Adnan", "Monir Sir"];
export const CONTRIBUTION_NOTES = ["Cash", "Bank Transfer", "bKash", "Nagad"];

// Categorical marks (the small bar/dot next to a name). Mid-tone hues chosen to read on both Executive Minimal and
// Midnight Finance surfaces (≥ 3:1 as non-text marks on #FFFFFF and #11161F). The name is always written beside the
// mark, so colour is never the only way to tell facilities or members apart.
const FACILITY_COLORS = ["#3F9A75", "#5B80B0", "#A87D2E", "#8C7AA6"];
const MEMBER_COLORS: Record<string, string> = { raja: "#3F9A75", somik: "#5B80B0", adnan: "#C2574A", "monir sir": "#A87D2E" };
const OTHER_COLOR = "#8A8F98";

/** Colour follows the facility, never its rank: known facilities keep their slot, others are grey. */
export function facilityLook(name: string) {
  const i = DEFAULT_FACILITIES.findIndex((f) => f.toLowerCase() === name.trim().toLowerCase());
  return { color: i < 0 ? OTHER_COLOR : FACILITY_COLORS[i] };
}

export function memberLook(name: string) {
  return { dot: MEMBER_COLORS[name.trim().toLowerCase()] ?? OTHER_COLOR };
}

/** Known names first (in their fixed order), then any others found in the data. */
export function mergeNames(defaults: string[], found: string[]) {
  const out = [...defaults];
  for (const n of found) if (!out.some((o) => o.toLowerCase() === n.trim().toLowerCase())) out.push(n.trim());
  return out;
}
