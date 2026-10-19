import "server-only";
import { createClient } from "@/lib/supabase/server";

// View mode: anyone with the passcode is signed in as one shared, read-only Supabase user (VIEWER_EMAIL).
// 0005_view_mode.sql lets that user read the owner's rows and blocks every write at the database level.
export const VIEW_PASSCODE = process.env.VIEW_PASSCODE || "mrrmr";

// Built-in defaults so view mode works without any hosting settings. The viewer account can only read, which is
// exactly what the passcode already grants, so keeping its login here exposes nothing extra. Env vars override.
export const VIEWER_EMAIL = process.env.VIEWER_EMAIL || "viewer@mrrmr.app";
export const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD || "WwNYGryJM2vEHxKag7hgSqZpLa7w";

export function isViewerEmail(email: string | null | undefined) {
  return Boolean(email && email.toLowerCase() === VIEWER_EMAIL.toLowerCase());
}

/** Supabase client for server actions that write; refuses in view mode. */
export async function writer() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (isViewerEmail(data?.claims?.email as string | undefined)) throw new Error("View mode is read-only.");
  return supabase;
}
