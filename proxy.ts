import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hardenCookie } from "@/lib/supabase/cookies";
import { isViewerEmail } from "@/lib/viewer";
import { isPublicPath, viewerMayOpen } from "@/lib/security";
import { hasVerifiedFactor, mfaExempt } from "@/lib/mfa-core";
import { buildCsp, makeNonce } from "@/lib/csp";

// Path rules live in lib/security.ts (unit-tested): public paths, and the viewer's allow-list.
// Every response from here carries a per-request nonce CSP (lib/csp.ts); Next.js reads the nonce from the
// Content-Security-Policy REQUEST header and puts it on its own scripts; the layout reads x-nonce for the theme script.

export async function proxy(request: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  // Session cookies refreshed by Supabase during this request: applied to whichever response we return.
  let refreshed: { name: string; value: string; options: CookieOptions }[] = [];
  let refreshHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Also on the request, so the page rendered after this sees the new session.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          refreshed = cookiesToSet;
          refreshHeaders = headers;
        },
      },
    }
  );

  const finish = <T extends NextResponse>(res: T): T => {
    refreshed.forEach(({ name, value, options }) => res.cookies.set(name, value, hardenCookie(options)));
    Object.entries(refreshHeaders).forEach(([k, v]) => res.headers.set(k, v));
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  const next = () => {
    const h = new Headers(request.headers);
    h.set("x-nonce", nonce);
    h.set("Content-Security-Policy", csp);
    return finish(NextResponse.next({ request: { headers: h } }));
  };
  const go = (pathname: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = search;
    return finish(NextResponse.redirect(url));
  };

  // Validates the JWT and refreshes the session cookie if needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;
  const isPublic = isPublicPath(path);

  if (!signedIn && !isPublic) return go("/login", path === "/" ? "" : `?next=${encodeURIComponent(path)}`);
  const viewer = signedIn && isViewerEmail(data?.claims?.email as string | undefined);
  // Already signed in: /login goes home. /view goes to Research for a viewer, but for the ADMIN it stays on /view —
  // which says "you're signed in as the admin" — instead of silently opening the admin dashboard.
  if (signedIn && (path === "/login" || (path === "/view" && viewer))) return go(viewer ? "/research" : "/");
  // View mode sees Research Finance only: every other page (and the CSV export) sends the viewer there.
  if (viewer && !viewerMayOpen(path)) return go("/research");
  // Admin MFA: with a verified authenticator, an aal1 session may open only /auth/* (the code step, sign-out there)
  // and /view until the code is entered. aal comes from the verified JWT; whether a factor exists comes from
  // getUser() (verified by Supabase, cached briefly per instance), never from the factor list in the cookie.
  if (signedIn && !viewer && data?.claims?.aal !== "aal2" && !mfaExempt(path)) {
    const sub = String(data?.claims?.sub ?? "");
    if (await adminHasFactor(supabase, sub))
      return go("/auth/mfa", path === "/" || path === "/login" ? "" : `?next=${encodeURIComponent(path)}`);
  }
  return next();
}

// sub → whether a verified factor exists, for 60 s. Keyed by the verified user id, so a client can't influence it.
const factorCache = new Map<string, { has: boolean; until: number }>();
async function adminHasFactor(supabase: { auth: { getUser: () => Promise<{ data: { user: { factors?: { status?: string }[] } | null } }> } }, sub: string) {
  const now = Date.now();
  const hit = factorCache.get(sub);
  if (hit && hit.until > now) return hit.has;
  const { data } = await supabase.auth.getUser();
  const has = hasVerifiedFactor(data.user?.factors);
  if (factorCache.size > 100) factorCache.clear();
  factorCache.set(sub, { has, until: now + 60_000 });
  return has;
}

export const config = {
  // Icons and the manifest stay public: browsers fetch them for bookmarks and the home screen without a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
