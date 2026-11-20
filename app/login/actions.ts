"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RateLimiter, clientIp, safeNextPath, siteOrigin, waitText } from "@/lib/security";
import { TURNSTILE_FAILED, TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";

export type AuthState = { error?: string; message?: string };

// Per-IP brakes in front of Supabase's own limits: 10 sign-in tries per 15 minutes, 5 reset emails per hour.
const signInLimit = new RateLimiter(10, 15 * 60_000);
const resetLimit = new RateLimiter(5, 60 * 60_000);

// Order in every unauthenticated action: rate limit → Turnstile → Supabase. A failed bot check never reaches Supabase.

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  const password = String(formData.get("password") ?? "").slice(0, 256);
  if (!email || !password) return { error: "Enter your email and password." };

  const h = await headers();
  const ip = clientIp((n) => h.get(n));
  const wait = signInLimit.hit(ip);
  if (wait) return { error: waitText(wait) };
  if (!(await verifyTurnstile(formData.get(TURNSTILE_FIELD), ip, "login"))) return { error: TURNSTILE_FAILED };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // One message for every failure, so the form can't be used to test which emails have accounts.
  if (error) return { error: error.status === 429 ? "Too many attempts. Try again later." : "Wrong email or password." };

  signInLimit.clear(ip);
  redirect(safeNextPath(formData.get("next")));
}

/** Sent from the sign-in form's "Forgot password?" button, so it carries that form's ("login") Turnstile token. */
export async function forgotPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  if (!email) return { error: "Type your email above first, then press “Forgot password?”." };

  const h = await headers();
  const ip = clientIp((n) => h.get(n));
  const wait = resetLimit.hit(ip);
  if (wait) return { error: waitText(wait) };
  if (!(await verifyTurnstile(formData.get(TURNSTILE_FIELD), ip, "login"))) return { error: TURNSTILE_FAILED };

  const origin = siteOrigin((n) => h.get(n));
  if (!origin) return { error: "Could not work out this site's address. Set SITE_URL and try again." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/auth/reset` });
  // Same answer whether or not the email exists (or Supabase refused), so this can't be used to find accounts.
  return { message: "If that email has an account, a reset link is on its way." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
