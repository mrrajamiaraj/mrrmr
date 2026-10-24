import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/security";

// Landing point for email links (password reset). Handles both link styles:
//  - ?token_hash=…&type=recovery  (works in any browser — needs the email template from the README)
//  - ?code=…                      (PKCE: only works in the same browser that asked for the email)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const fail = (text: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(text)}`);

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    if (/code verifier/i.test(error.message))
      return fail("Open the reset link in the same browser where you pressed “Forgot password?”, or request a new link here.");
  }

  if (searchParams.get("error_code") === "otp_expired")
    return fail("That reset link was already used or is too old. Each link works once — request a new one and use only the newest email.");
  return fail("That link is invalid or has expired. Try again.");
}
