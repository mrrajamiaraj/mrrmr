import "server-only";
import { createClient } from "@/lib/supabase/server";

// View mode: anyone with the passcode is signed in as one shared, read-only Supabase user (VIEWER_EMAIL).
// 0005_view_mode.sql lets that user read the owner's rows and blocks every write at the database level.
//
// SECURITY: the fallbacks below keep view mode working with no hosting settings, but they are in the source code,
// so anyone who can read the code can sign in as the viewer directly through Supabase and read every record, without
// the passcode. Set VIEW_PASSCODE, VIEWER_EMAIL and VIEWER_PASSWORD in Vercel and rotate the viewer password
// (README → "View mode"); the fallbacks are then never used.
export const VIEW_PASSCODE = process.env.VIEW_PASSCODE || "mrrmr";
export const VIEWER_EMAIL = process.env.VIEWER_EMAIL || "viewer@mrrmr.app";
export const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD || "WwNYGryJM2vEHxKag7hgSqZpLa7w";

if (process.env.NODE_ENV === "production" && (!process.env.VIEWER_PASSWORD || !process.env.VIEW_PASSCODE)) {
  console.warn("[security] VIEWER_PASSWORD / VIEW_PASSCODE are not set: view mode is using the built-in defaults from the source code.");
}

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
