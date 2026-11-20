import { redirect } from "next/navigation";
import { ShieldIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { isViewerEmail } from "@/lib/viewer";
import { hasVerifiedFactor } from "@/lib/mfa-core";
import { safeNextPath } from "@/lib/security";
import { turnstileSiteKey } from "@/lib/turnstile";
import { signOut } from "@/app/login/actions";
import { MfaForm } from "./mfa-form";

export const metadata = { title: "Two-step sign-in" };
export const dynamic = "force-dynamic";

/** Second sign-in step for an admin with an authenticator. The proxy sends every other page here until it's done. */
export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  if (isViewerEmail(claims.email as string | undefined)) redirect("/research");
  if (claims.aal === "aal2") redirect(next);
  const { data: u } = await supabase.auth.getUser();
  if (!hasVerifiedFactor(u.user?.factors)) redirect(next);

  return (
    <main className="grid min-h-dvh place-items-center bg-page px-4 py-8">
      <div className="flex w-full max-w-[420px] animate-pop-in flex-col gap-5 rounded-2xl border border-line bg-surface px-5 py-7 shadow-[0_24px_60px_-30px_rgba(28,27,24,0.35)] sm:px-8 sm:py-9">
        <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl border border-good-line bg-gradient-to-b from-good-tint to-good-tint-2 text-brand-ink">
          <ShieldIcon size={22} />
        </span>
        <div>
          <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em]">Enter your code</h1>
          <div className="mt-1 text-sm text-slate-500">Open your authenticator app and type the 6-digit code for MRRMR.</div>
        </div>
        <MfaForm next={next} siteKey={turnstileSiteKey()} />
        <form action={signOut} className="self-center">
          <button type="submit" className="min-h-9 rounded-md px-2 text-[13.5px] font-medium text-slate-600 hover:bg-subtle hover:text-ink">Sign out</button>
        </form>
      </div>
    </main>
  );
}
