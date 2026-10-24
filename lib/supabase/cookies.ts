import type { CookieOptions } from "@supabase/ssr";

/**
 * Session cookie settings. The app never talks to Supabase from the browser (every query runs on the server), so
 * the auth cookies can be httpOnly: page scripts, including any injected ones, cannot read the tokens. Secure in
 * production so they never travel over plain HTTP; SameSite=Lax blocks them on cross-site form posts.
 */
export function hardenCookie(options: CookieOptions = {}): CookieOptions {
  return { ...options, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: options.path ?? "/" };
}
