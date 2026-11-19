import { SignInCard } from "@/app/login/sign-in-card";
import { createClient } from "@/lib/supabase/server";
import { isViewerEmail } from "@/lib/viewer";

/**
 * The view-mode entrance. If the ADMIN is signed in on this browser it says so (the proxy no longer forwards them to
 * the dashboard), and entering the viewer key signs the admin out here first — so a view-mode session never carries
 * admin access.
 */
export default async function ViewPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  const adminHere = Boolean(data?.claims && !isViewerEmail(email));
  return <SignInCard next="/" initialMode="viewer" adminSignedIn={adminHere} />;
}
