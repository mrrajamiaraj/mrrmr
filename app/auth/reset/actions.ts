"use server";

import { createClient } from "@/lib/supabase/server";
import { passwordProblems } from "@/lib/password";
import { isViewerEmail } from "@/lib/viewer";
import { isRecoverySession, waitText } from "@/lib/security";
import { hitAll, ipKey, requestIp } from "@/lib/rate-limit";
import { TURNSTILE_FAILED, verifyTurnstile } from "@/lib/turnstile";

// Per-IP brake on setting a password from a reset link: 10 tries per 15 minutes.

/**
 * Sets a new password without asking for the old one, so it is only allowed for a session that was just opened
 * from a reset email. Any other session (including the shared view-mode user) must use "Change password",
 * which checks the current password first.
 */
export async function resetPassword(password: string, turnstileToken: string): Promise<{ error?: string }> {
  if (typeof password !== "string" || password.length > 256 || passwordProblems(password).length)
    return { error: "The new password does not meet all four requirements." };

  const ip = await requestIp();
  const wait = await hitAll([["resetForm", ipKey(ip)]]);
  if (wait) return { error: waitText(wait) };
  if (!(await verifyTurnstile(turnstileToken, ip, "reset"))) return { error: TURNSTILE_FAILED };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { error: "This reset link has expired. Request a new one from the sign-in page." };
  if (isViewerEmail(claims.email as string | undefined)) return { error: "View mode is read-only." };
  if (!isRecoverySession(claims.amr as Parameters<typeof isRecoverySession>[0], Date.now() / 1000, 3600, claims.iat))
    return { error: "Open the newest reset link from your email to set a new password, or use Admin → Change password." };

  const { error } = await supabase.auth.updateUser({
    password,
    data: { password_changed_at: new Date().toISOString() },
  });
  // Generic: Supabase's own message could reveal internals (e.g. password policy details are already shown above).
  if (!error) return {};
  if (error.code === "same_password") return { error: "Choose a password you haven't used for this account." };
  if (error.code === "insufficient_aal") return { error: "Two-step sign-in is on: enter your authenticator code at /auth/mfa?next=/auth/reset first, then set the password." };
  return { error: "Could not set the new password. Request a new reset link and try again." };
}
