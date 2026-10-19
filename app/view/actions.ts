"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VIEW_PASSCODE } from "@/lib/viewer";
import type { AuthState } from "@/app/login/actions";

export async function enterViewMode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const passcode = String(formData.get("passcode") ?? "");
  if (!passcode) return { error: "Enter the view password." };
  if (passcode !== VIEW_PASSCODE) return { error: "That password is not correct." };

  const email = process.env.VIEWER_EMAIL;
  const password = process.env.VIEWER_PASSWORD;
  if (!email || !password) return { error: "View mode is not set up yet: VIEWER_EMAIL and VIEWER_PASSWORD are missing." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: `Could not open view mode: ${error.message}` };

  redirect("/account");
}

export async function exitViewMode() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/view");
}
