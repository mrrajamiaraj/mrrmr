import { SignInCard } from "@/app/login/sign-in-card";
import { createClient } from "@/lib/supabase/server";
import { isViewerEmail } from "@/lib/viewer";
import { headers } from "next/headers";
import { turnstileSiteKey } from "@/lib/turnstile";

/**
 * The view-mode entrance. If the ADMIN is signed in on this browser it says so (the proxy doesn't forward them to the
 * dashboard), and opening the view signs the admin out here first — a view-mode session never carries admin access.
 */
export default async function ViewPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const adminHere = Boolean(data?.claims && !isViewerEmail(data.claims.email as string | undefined));
  return <SignInCard next="/" initialMode="viewer" adminSignedIn={adminHere} siteKey={turnstileSiteKey()} nonce={(await headers()).get("x-nonce") ?? undefined} />;
}
