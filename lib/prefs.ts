// Personal preferences, stored in Supabase Auth user metadata (`prefs`) — never in a financial table, so saving a
// preference can't touch a record. Not a "use server" file, so it can export constants. Tested in tests/prefs.test.mjs.

export const LANDING_PAGES = [
  ["/account", "Overview"], ["/debtors", "Debtors & Loans"], ["/repayments", "Repayment Center"], ["/cards/1", "City Bank Card"],
  ["/cards/2", "Community Card"], ["/reports", "Reports & Outlook"], ["/research", "Research Finance"],
] as const;
export type Landing = (typeof LANDING_PAGES)[number][0];
export type Density = "comfortable" | "compact";
export type ChartRange = "6" | "12" | "all" | "year";

export type Prefs = {
  landing: Landing;
  density: Density;
  /** show paisa (৳1,234.50) on figures instead of whole taka (৳1,235) */
  paisa: boolean;
  chartRange: ChartRange;
};

export const DEFAULT_PREFS: Prefs = { landing: "/account", density: "comfortable", paisa: false, chartRange: "6" };

/** Anything in → a valid Prefs out. Unknown values fall back to the defaults, never to arbitrary strings (e.g. an off-site landing URL). */
export function normalizePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    landing: LANDING_PAGES.some(([p]) => p === r.landing) ? (r.landing as Landing) : DEFAULT_PREFS.landing,
    density: r.density === "compact" ? "compact" : "comfortable",
    paisa: r.paisa === true,
    chartRange: (["6", "12", "all", "year"] as const).includes(r.chartRange as ChartRange) ? (r.chartRange as ChartRange) : "6",
  };
}
