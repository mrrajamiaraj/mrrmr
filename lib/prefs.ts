// Personal preferences, stored in Supabase Auth user metadata (`prefs`) — never in a financial table, so saving a
// preference can't touch a record. Not a "use server" file, so it can export constants. Tested in tests/prefs.test.mjs.
// (A saved `chartRange` from before the redesign is simply ignored: the charts it controlled were removed.)

export const LANDING_PAGES = [
  ["/account", "Overview"], ["/debtors", "People"], ["/repayments", "Repayments"], ["/cards/1", "City Bank Amex Gold"],
  ["/cards/2", "Community Visa Platinum"], ["/research", "Research ledger"],
] as const;
export type Landing = (typeof LANDING_PAGES)[number][0];
export type Density = "comfortable" | "compact";

export type Prefs = {
  landing: Landing;
  density: Density;
  /** show paisa (৳1,234.50) on figures instead of whole taka (৳1,235) */
  paisa: boolean;
};

export const DEFAULT_PREFS: Prefs = { landing: "/account", density: "comfortable", paisa: false };

/** Anything in → a valid Prefs out. Unknown values fall back to the defaults, never to arbitrary strings (e.g. an off-site landing URL). */
export function normalizePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    landing: LANDING_PAGES.some(([p]) => p === r.landing) ? (r.landing as Landing) : DEFAULT_PREFS.landing,
    density: r.density === "compact" ? "compact" : "comfortable",
    paisa: r.paisa === true,
  };
}
