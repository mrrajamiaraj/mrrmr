import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// One client per request. Server Components can't write cookies, so setAll
// may throw there; proxy.ts refreshes the session cookie instead.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}
