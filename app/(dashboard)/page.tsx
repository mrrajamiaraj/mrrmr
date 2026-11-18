import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizePrefs } from "@/lib/prefs";
import { isViewerEmail } from "@/lib/viewer";

// "/" opens the landing page chosen in Settings (validated to a known in-app page; default Overview).
// View mode always lands on Research — the only section it may open.
export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (isViewerEmail(data.user?.email)) redirect("/research");
  redirect(normalizePrefs(data.user?.user_metadata?.prefs).landing);
}
