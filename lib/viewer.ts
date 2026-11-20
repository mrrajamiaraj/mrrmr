import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasVerifiedFactor } from "@/lib/mfa-core";

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

/** Shown when an admin with an authenticator has not entered today's code yet. */
export const MFA_REQUIRED = "Enter the code from your authenticator app first (sign in again if this keeps happening).";

/**
 * Supabase client for server actions that write. Refuses when nobody is signed in, in view mode, and — for an admin
 * with a verified authenticator — when the session is not aal2, before any query runs. (The database refuses all of
 * these too once 0014 is applied; this makes the app say so clearly and never relies on that alone.)
 * The factor check uses getUser() (verified by Supabase), never the factor list stored in the cookie.
 */
export async function writer() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) throw new Error("Your session has expired. Sign in again.");
  if (isViewerEmail(claims.email as string | undefined)) throw new Error("View mode is read-only.");
  if (claims.aal !== "aal2") {
    const { data: u, error } = await supabase.auth.getUser();
    if (error || !u.user) throw new Error("Your session has expired. Sign in again.");
    if (hasVerifiedFactor(u.user.factors)) throw new Error(MFA_REQUIRED);
  }
  return supabase;
}
