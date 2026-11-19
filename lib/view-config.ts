// View-mode configuration check. Pure (no imports), so tests/security.test.mjs can verify it fails closed.
//
// Owner decision 2026-11-19: view mode needs NO key — anyone with the /view link gets a read-only look at the
// Research ledger. What a viewer can see is still enforced by the database (RLS: research tables only, no writes) and
// by the proxy's allow-list, not by a key. View mode is ON only when the viewer account's password is configured.

/** Minimum length of the viewer account's Supabase password (random, never typed by people). */
export const MIN_VIEWER_PASSWORD = 16;

export type ViewModeConfig = { email: string; password: string };

/** The viewer account's credentials from server env vars, or null when view mode is not (safely) configured — never a default. */
export function viewModeConfig(env: Record<string, string | undefined> = process.env): ViewModeConfig | null {
  const password = env.VIEWER_PASSWORD ?? "";
  if (password.length < MIN_VIEWER_PASSWORD) return null;
  return { email: env.VIEWER_EMAIL || "viewer@mrrmr.app", password };
}
