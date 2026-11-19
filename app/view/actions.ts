"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isViewerEmail, viewModeConfig } from "@/lib/viewer";
import { RateLimiter, clientIp, waitText } from "@/lib/security";
import type { AuthState } from "@/app/login/actions";

// No key is needed (owner decision 2026-11-19), but each button press signs in to Supabase, so it is still throttled:
// 8 per IP every 15 minutes.
const viewLimit = new RateLimiter(8, 15 * 60_000);

/** Opens the read-only view: signs this browser in as the shared viewer account, which can read the Research ledger only. */
export async function enterViewMode(_prev: AuthState, _formData: FormData): Promise<AuthState> {
  const h = await headers();
  const ip = clientIp((n) => h.get(n));
  const wait = viewLimit.hit(ip);
  if (wait) return { error: waitText(wait) };

  // Fails closed: without the viewer account's password configured on the server there is no view mode.
  const cfg = viewModeConfig();
  if (!cfg) return { error: "View mode isn't available right now." };

  const supabase = await createClient();
  // If the admin is signed in on this browser, end that session here first, so the view-mode session that follows
  // can never carry admin access.
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
