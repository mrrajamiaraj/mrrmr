"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VIEW_PASSCODE, VIEWER_EMAIL, VIEWER_PASSWORD } from "@/lib/viewer";
import { RateLimiter, clientIp, secretEquals, waitText } from "@/lib/security";
import type { AuthState } from "@/app/login/actions";

// The view key is short and shared, so guessing it must be slow: 8 tries per IP every 15 minutes.
const viewLimit = new RateLimiter(8, 15 * 60_000);

export async function enterViewMode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const passcode = String(formData.get("passcode") ?? "").slice(0, 256);
  if (!passcode) return { error: "Enter the view password." };

  const h = await headers();
  const ip = clientIp((n) => h.get(n));
  const wait = viewLimit.hit(ip);
  if (wait) return { error: waitText(wait) };
  if (!secretEquals(passcode, VIEW_PASSCODE)) return { error: "That password is not correct." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: VIEWER_EMAIL, password: VIEWER_PASSWORD });
  // The real reason goes to the server log only; visitors don't need to learn about the viewer account.
  if (error) {
    console.error("View mode sign-in failed:", error.message);
    return { error: "View mode is unavailable right now. Try again later." };
  }

  viewLimit.clear(ip);
  redirect("/account");
}

export async function exitViewMode() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/view");
}
