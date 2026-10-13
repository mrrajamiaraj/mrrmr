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
const FACILITY_COLORS = ["#059669", "#2563EB", "#D97706", "#9333EA"];
const FACILITY_SOFT = [
  { bg: "#ECFDF5", border: "#A7F3D0", chip: "bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]" },
  { bg: "#EFF6FF", border: "#BFDBFE", chip: "bg-[#DBEAFE] text-[#1E40AF] border-[#93C5FD]" },
  { bg: "#FFFBEB", border: "#FDE68A", chip: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]" },
  { bg: "#FAF5FF", border: "#E9D5FF", chip: "bg-[#F3E8FF] text-[#6B21A8] border-[#D8B4FE]" },
];
const OTHER = { color: "#64748B", bg: "#F8FAFC", border: "#E2E8F0", chip: "bg-soft text-slate-700 border-[#CBD5E1]" };

/** Colour follows the facility, never its rank: known facilities keep their slot, others are gray. */
export function facilityLook(name: string) {
  const i = DEFAULT_FACILITIES.findIndex((f) => f.toLowerCase() === name.trim().toLowerCase());
  if (i < 0) return OTHER;
  return { color: FACILITY_COLORS[i], ...FACILITY_SOFT[i] };
}

const MEMBER_LOOK: Record<string, { chip: string; dot: string; card: string; bar: string }> = {
  raja: { chip: "bg-[#F0FDFA] text-[#0F766E] border-[#99F6E4]", dot: "#14B8A6", card: "border-[#99F6E4]", bar: "#14B8A6" },
  somik: { chip: "bg-[#EEF2FF] text-[#4338CA] border-[#C7D2FE]", dot: "#6366F1", card: "border-[#C7D2FE]", bar: "#6366F1" },
  adnan: { chip: "bg-[#FFF1F2] text-[#BE123C] border-[#FECDD3]", dot: "#F43F5E", card: "border-[#FECDD3]", bar: "#F43F5E" },
  "monir sir": { chip: "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]", dot: "#F59E0B", card: "border-[#FDE68A]", bar: "#F59E0B" },
};
export function memberLook(name: string) {
  return MEMBER_LOOK[name.trim().toLowerCase()] ?? { chip: "bg-soft text-slate-700 border-[#CBD5E1]", dot: "#64748B", card: "border-line", bar: "#64748B" };
}

/** Known names first (in their fixed order), then any others found in the data. */
export function mergeNames(defaults: string[], found: string[]) {
  const out = [...defaults];
  for (const n of found) if (!out.some((o) => o.toLowerCase() === n.trim().toLowerCase())) out.push(n.trim());
  return out;
}
