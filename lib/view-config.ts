// View-mode configuration check. Pure (no imports), so tests/security.test.mjs can verify it fails closed.

/** Minimum passcode length: the view key is the only thing between the internet and the research ledger. */
export const MIN_PASSCODE = 12;
/** Minimum length of the viewer account's Supabase password (random, never typed by people). */
export const MIN_VIEWER_PASSWORD = 16;

export type ViewModeConfig = { passcode: string; email: string; password: string };

/** The view-mode credentials from server env vars, or null when view mode is not (safely) configured — never a default. */
export function viewModeConfig(env: Record<string, string | undefined> = process.env): ViewModeConfig | null {
  const passcode = env.VIEW_PASSCODE ?? "";
  const password = env.VIEWER_PASSWORD ?? "";
  if (passcode.length < MIN_PASSCODE || password.length < MIN_VIEWER_PASSWORD) return null;
  return { passcode, email: env.VIEWER_EMAIL || "viewer@mrrmr.app", password };
}
