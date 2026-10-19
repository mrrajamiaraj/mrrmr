import "server-only";
import { createClient } from "@/lib/supabase/server";

// View mode: anyone with the passcode is signed in as one shared, read-only Supabase user (VIEWER_EMAIL).
// 0005_view_mode.sql lets that user read the owner's rows and blocks every write at the database level.
export const VIEW_PASSCODE = process.env.VIEW_PASSCODE || "mrrmr";

export function isViewerEmail(email: string | null | undefined) {
  const viewer = process.env.VIEWER_EMAIL;
  return Boolean(viewer && email && email.toLowerCase() === viewer.toLowerCase());
}

/** Supabase client for server actions that write; refuses in view mode. */
export async function writer() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (isViewerEmail(data?.claims?.email as string | undefined)) throw new Error("View mode is read-only.");
  return supabase;
}
