import { createClient } from "@/lib/supabase/server";
import { SettingsView } from "./settings-view";
import { MfaSection } from "./mfa-section";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  // Factor status from getUser() (verified by Supabase), not from the cookie.
  const supabase = await createClient();
  const [{ data: u }, { data: c }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getClaims()]);
  const factor = u.user?.factors?.find((f) => f.status === "verified" && f.factor_type === "totp") ?? null;
  return <SettingsView security={<MfaSection factorId={factor?.id ?? null} aal={(c?.claims?.aal as string | undefined) ?? null} />} />;
}
