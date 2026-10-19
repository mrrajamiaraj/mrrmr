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

// Categorical facility hues, fixed order (validated: lightness, chroma, CVD, contrast all pass).
const FACILITY_COLORS = ["#3D7D61", "#3F5F87", "#B9852F", "#7A6890"];
const FACILITY_SOFT = [
  { bg: "#F2F6F3", border: "#CADBD0", chip: "bg-[#E3ECE6] text-[#1F4D3A] border-[#CADBD0]" },
  { bg: "#F1F3F7", border: "#D3DBE5", chip: "bg-[#E2E7EE] text-[#2C4463] border-[#C5CFDC]" },
  { bg: "#FAF6EC", border: "#E6D7B5", chip: "bg-[#F6EEDC] text-[#85570F] border-[#E6D7B5]" },
  { bg: "#F4F2F6", border: "#DDD6E5", chip: "bg-[#ECE8F0] text-[#5B4A6E] border-[#CFC6DA]" },
];
const OTHER = { color: "#7A766C", bg: "#FAF9F6", border: "#E3E1DA", chip: "bg-soft text-slate-700 border-[#D6D3CB]" };

/** Colour follows the facility, never its rank: known facilities keep their slot, others are gray. */
export function facilityLook(name: string) {
  const i = DEFAULT_FACILITIES.findIndex((f) => f.toLowerCase() === name.trim().toLowerCase());
  if (i < 0) return OTHER;
  return { color: FACILITY_COLORS[i], ...FACILITY_SOFT[i] };
}

const MEMBER_LOOK: Record<string, { chip: string; dot: string; card: string; bar: string }> = {
  raja: { chip: "bg-[#F2F6F3] text-[#2E6B52] border-[#CADBD0]", dot: "#3D7D61", card: "border-[#CADBD0]", bar: "#3D7D61" },
  somik: { chip: "bg-[#EEF1F5] text-[#355276] border-[#D3DBE5]", dot: "#5A7397", card: "border-[#D3DBE5]", bar: "#5A7397" },
  adnan: { chip: "bg-[#F8ECE9] text-[#9B3426] border-[#E9C9C1]", dot: "#B4483A", card: "border-[#E9C9C1]", bar: "#B4483A" },
  "monir sir": { chip: "bg-[#FAF6EC] text-[#85570F] border-[#E6D7B5]", dot: "#B9852F", card: "border-[#E6D7B5]", bar: "#B9852F" },
};
export function memberLook(name: string) {
  return MEMBER_LOOK[name.trim().toLowerCase()] ?? { chip: "bg-soft text-slate-700 border-[#D6D3CB]", dot: "#7A766C", card: "border-line", bar: "#7A766C" };
}

/** Known names first (in their fixed order), then any others found in the data. */
export function mergeNames(defaults: string[], found: string[]) {
  const out = [...defaults];
  for (const n of found) if (!out.some((o) => o.toLowerCase() === n.trim().toLowerCase())) out.push(n.trim());
  return out;
}
