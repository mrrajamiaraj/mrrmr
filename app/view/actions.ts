"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isViewerEmail, viewModeConfig } from "@/lib/viewer";
import { RateLimiter, clientIp, secretEquals, waitText } from "@/lib/security";
import type { AuthState } from "@/app/login/actions";

// The view key is shared, so guessing it must be slow: 8 tries per IP every 15 minutes.
const viewLimit = new RateLimiter(8, 15 * 60_000);

export async function enterViewMode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const passcode = String(formData.get("passcode") ?? "").slice(0, 256);
  if (!passcode) return { error: "Enter the view password." };

  const h = await headers();
  const ip = clientIp((n) => h.get(n));
  const wait = viewLimit.hit(ip);
  if (wait) return { error: waitText(wait) };

  // Fails closed: no configured (and strong enough) credentials → no view mode. Same message as a wrong key so the
  // form can't be used to learn whether view mode is set up.
  const cfg = viewModeConfig();
  if (!cfg || !secretEquals(passcode, cfg.passcode)) return { error: "That password is not correct." };

  const supabase = await createClient();
  // If the admin is signed in on this browser, end that session here first, so the view-mode session that follows
  // can never carry admin access (and the admin's refresh token is revoked rather than left in the cookie jar).
  const { data: current } = await supabase.auth.getClaims();
  if (current?.claims && !isViewerEmail(current.claims.email as string | undefined)) {
    await supabase.auth.signOut({ scope: "local" });
  }
  const { error } = await supabase.auth.signInWithPassword({ email: cfg.email, password: cfg.password });
  if (error) {
    // Server log only, without credentials or personal data.
    console.error("[view] viewer sign-in failed:", error.status ?? "", error.code ?? "");
    return { error: "View mode is unavailable right now. Try again later." };
  }

  viewLimit.clear(ip);
  redirect("/research");
}

/**
 * Ends THIS viewer's session only. The viewer account is shared, so the default global sign-out would also sign out
 * every other person viewing. (Admin sign-out in app/login/actions.ts stays global: it ends every admin session.)
 */
export async function exitViewMode() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/view");
}
