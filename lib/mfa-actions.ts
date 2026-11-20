"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isViewerEmail, writer } from "@/lib/viewer";
import { cleanTotp, freshAal2, hasVerifiedFactor } from "@/lib/mfa-core";
import { hitAll, ipKey, requestIp } from "@/lib/rate-limit";
import { hashKey } from "@/lib/rate-limit-core";
import { TURNSTILE_FAILED, TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";
import { safeNextPath, waitText } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security-log";

type Result = { error?: string };
export type MfaState = { error?: string };

const WRONG_CODE = "That code didn't work. Check the time on your phone and try the newest code.";

/** 5 code attempts per 15 minutes, per account AND per IP: a stolen password can't be used to brute-force the code. */
async function codeLimit(userId: string): Promise<number> {
  const ip = await requestIp();
  return hitAll([["mfa", hashKey(`user:${userId}`)], ["mfa", ipKey(ip)]]);
}

/**
 * Step 2 of sign-in (/auth/mfa): rate limit → Turnstile → verify the TOTP code, which upgrades the session to aal2.
 */
export async function verifyMfa(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  if (isViewerEmail(claims.email as string | undefined)) redirect("/research");

  const wait = await codeLimit(claims.sub);
  if (wait) { logSecurityEvent("rate_limit_hit", { limiter: "mfa" }); return { error: waitText(wait) }; }
  const ip = await requestIp();
  if (!(await verifyTurnstile(formData.get(TURNSTILE_FIELD), ip, "mfa"))) {
    logSecurityEvent("turnstile_fail", { action: "mfa", ip });
    return { error: TURNSTILE_FAILED };
  }
  const code = cleanTotp(formData.get("code"));
  if (!code) return { error: "Enter the 6-digit code from your authenticator app." };

  const { data: u } = await supabase.auth.getUser();
  const factor = u.user?.factors?.find((f) => f.status === "verified" && f.factor_type === "totp");
  if (!factor) redirect("/");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) { logSecurityEvent("mfa_fail", { ip }); return { error: WRONG_CODE }; }
  logSecurityEvent("mfa_success", { ip });
  redirect(safeNextPath(formData.get("next")));
}

/** Settings: start adding an authenticator. Returns the QR (SVG data URL) and the manual secret. */
export async function startTotpEnroll(): Promise<Result & { factorId?: string; qr?: string; secret?: string }> {
  let supabase;
  try { supabase = await writer(); } catch (e) { return { error: (e as Error).message }; }
  const { data: u } = await supabase.auth.getUser();
  // Clear any unfinished enrollment first, so leftovers never pile up (unverified factors can be removed at aal1).
  for (const f of u.user?.factors ?? []) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  if (hasVerifiedFactor(u.user?.factors)) return { error: "An authenticator is already set up. Remove it first to add a new one." };
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `MRRMR ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { error: "Two-step sign-in isn't available right now. Check that TOTP is enabled in Supabase → Authentication → MFA." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Settings: confirm the new authenticator with its first code. The session becomes aal2. */
export async function confirmTotpEnroll(factorId: string, code: string): Promise<Result> {
  let supabase;
  try { supabase = await writer(); } catch (e) { return { error: (e as Error).message }; }
  const { data } = await supabase.auth.getClaims();
  const wait = await codeLimit(String(data?.claims?.sub ?? ""));
  if (wait) return { error: waitText(wait) };
  const c = cleanTotp(code);
  if (!c || typeof factorId !== "string" || factorId.length > 64) return { error: "Enter the 6-digit code from your authenticator app." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: c });
  if (error) return { error: WRONG_CODE };
  logSecurityEvent("mfa_enrolled", {});
  return {};
}

/**
 * Settings: remove the authenticator. Needs a fresh second factor (code entered in the last 10 minutes). Warning
 * shown in the UI: once migration 0014 is applied the database requires aal2, so without a factor nothing loads.
 */
export async function removeTotp(factorId: string): Promise<Result> {
  let supabase;
  try { supabase = await writer(); } catch (e) { return { error: (e as Error).message }; }
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!freshAal2(claims?.aal, claims?.amr as Parameters<typeof freshAal2>[1], Date.now() / 1000, 600, claims?.iat))
    return { error: "For safety, sign out and back in with your code, then remove it within 10 minutes." };
  if (typeof factorId !== "string" || factorId.length > 64) return { error: "Unknown authenticator." };
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { error: "Could not remove the authenticator. Try again." };
  logSecurityEvent("mfa_removed", {});
  return {};
}
