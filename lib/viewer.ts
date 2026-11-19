import "server-only";
import { createClient } from "@/lib/supabase/server";

// View mode: someone with the view passcode is signed in as one shared, read-only Supabase user (the "viewer").
// Database policies (0005 + 0007) let that user read the research tables ONLY and block every write.
//
// SECURITY (Phase 7): there are NO built-in defaults any more. The passcode and the viewer's password come only from
// server environment variables (never NEXT_PUBLIC_, never sent to the browser). If they're missing or the passcode is
// weak, view mode is OFF — it fails closed instead of falling back to a value in the source code.

/** The viewer account's email. Not a secret (it identifies sessions for the route allow-list); override with VIEWER_EMAIL. */
export const VIEWER_EMAIL = process.env.VIEWER_EMAIL || "viewer@mrrmr.app";

export { viewModeConfig, type ViewModeConfig } from "@/lib/view-config";

export function isViewerEmail(email: string | null | undefined) {
  return Boolean(email && email.toLowerCase() === VIEWER_EMAIL.toLowerCase());
}

/**
 * Supabase client for server actions that write. Refuses when nobody is signed in and in view mode, before any
 * query runs. (The database refuses both anyway; this makes the app say so clearly and never relies on that alone.)
 */
export async function writer() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) throw new Error("Your session has expired. Sign in again.");
  if (isViewerEmail(claims.email as string | undefined)) throw new Error("View mode is read-only.");
  return supabase;
}
