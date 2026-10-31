import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hardenCookie } from "@/lib/supabase/cookies";
import { isViewerEmail } from "@/lib/viewer";

const PUBLIC_PATHS = ["/login", "/auth", "/view"];
const VIEWER_PATHS = ["/research"];

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
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  if (signedIn && (path === "/login" || path === "/view")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // View mode sees Research Finance only: every other page (and the CSV export) sends the viewer there.
  if (signedIn && isViewerEmail(data?.claims?.email as string | undefined) && !isPublic && !VIEWER_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
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
