import { createClient } from "@/lib/supabase/server";
import { AdminProvider, TopBar } from "@/components/shell";
import { Toaster } from "@/components/toast";
import { timestampLong } from "@/lib/format";
import { isViewerEmail } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const changedAt = (user?.user_metadata?.password_changed_at as string | undefined) ?? null;

  return (
    <AdminProvider
      value={{
        email: user?.email ?? "",
        lastChanged: changedAt ? timestampLong(changedAt) : "— not recorded yet",
        viewer: isViewerEmail(user?.email),
      }}
    >
      <div className="min-h-dvh">
        <TopBar />
        {children}
      </div>
      <Toaster />
    </AdminProvider>
  );
}
