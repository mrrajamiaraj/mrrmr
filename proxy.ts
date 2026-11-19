import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hardenCookie } from "@/lib/supabase/cookies";
import { isViewerEmail } from "@/lib/viewer";
import { isPublicPath, viewerMayOpen } from "@/lib/security";

// Path rules live in lib/security.ts (unit-tested): public paths, and the viewer's allow-list.

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, hardenCookie(options))
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );

  // Validates the JWT and refreshes the session cookie if needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;
  const isPublic = isPublicPath(path);

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  const viewer = signedIn && isViewerEmail(data?.claims?.email as string | undefined);
  // Already signed in: /login goes home. /view goes to Research for a viewer, but for the ADMIN it stays on /view —
  // which says "you're signed in as the admin" — instead of silently opening the admin dashboard.
  if (signedIn && (path === "/login" || (path === "/view" && viewer))) {
    const url = request.nextUrl.clone();
    url.pathname = viewer ? "/research" : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // View mode sees Research Finance only: every other page (and the CSV export) sends the viewer there.
  if (viewer && !viewerMayOpen(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/research";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Icons and the manifest stay public: browsers fetch them for bookmarks and the home screen without a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
