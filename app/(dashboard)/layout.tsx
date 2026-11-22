import { createClient } from "@/lib/supabase/server";
import { AdminProvider, TopBar } from "@/components/shell";
import { PrefsProvider } from "@/components/prefs";
import { Toaster } from "@/components/toast";
import { timestampLong } from "@/lib/format";
import { isViewerEmail } from "@/lib/viewer";
import { normalizePrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // getClaims() verifies the signed (ES256) session token locally: no round trip to Supabase Auth on every page.
  // Display only (email, prefs, password date); every data read is still checked by Postgres RLS, and actions that
  // change prefs or the password refresh the session so the token carries the new values at once.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const meta = (claims?.user_metadata ?? {}) as Record<string, unknown>;
  const user = claims ? { email: claims.email as string | undefined } : null;
  const changedAt = (meta.password_changed_at as string | undefined) ?? null;
  const prefs = normalizePrefs(meta.prefs);

  return (
    <AdminProvider
      value={{
        email: user?.email ?? "",
        lastChanged: changedAt ? timestampLong(changedAt) : "— not recorded yet",
        viewer: isViewerEmail(user?.email),
      }}
    >
      <PrefsProvider value={prefs}>
        {/* ≥1024px the fixed sidebar takes the left edge; content sits beside it. data-density drives table spacing. */}
        <div className="min-h-dvh lg:pl-[var(--sidebar-w)]" data-density={prefs.density}>
          <TopBar />
          {children}
        </div>
        <Toaster />
      </PrefsProvider>
    </AdminProvider>
  );
}
