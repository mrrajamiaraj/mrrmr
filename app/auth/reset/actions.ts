"use server";

import { createClient } from "@/lib/supabase/server";
import { passwordProblems } from "@/lib/password";

export async function resetPassword(password: string): Promise<{ error?: string }> {
  if (passwordProblems(password).length) return { error: "The new password does not meet all four requirements." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password,
    data: { password_changed_at: new Date().toISOString() },
  });
  return error ? { error: error.message } : {};
}
