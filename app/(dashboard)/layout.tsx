import { createClient } from "@/lib/supabase/server";
import { AdminProvider, TopBar } from "@/components/shell";
import { PrefsProvider } from "@/components/prefs";
import { Toaster } from "@/components/toast";
import { timestampLong } from "@/lib/format";
import { isViewerEmail } from "@/lib/viewer";
import { normalizePrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const changedAt = (user?.user_metadata?.password_changed_at as string | undefined) ?? null;
  const prefs = normalizePrefs(user?.user_metadata?.prefs);

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
