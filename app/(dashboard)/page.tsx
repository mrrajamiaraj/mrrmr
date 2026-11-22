import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizePrefs } from "@/lib/prefs";
import { isViewerEmail } from "@/lib/viewer";

// "/" opens the landing page chosen in Settings (validated to a known in-app page; default Overview).
// View mode always lands on Research — the only section it may open.
export default async function HomePage() {
  const supabase = await createClient();
  // Verified locally from the signed session token (see the dashboard layout); no Auth round trip.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (isViewerEmail(claims?.email as string | undefined)) redirect("/research");
  redirect(normalizePrefs((claims?.user_metadata as Record<string, unknown> | undefined)?.prefs).landing);
}
