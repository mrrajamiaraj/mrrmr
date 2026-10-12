import { LoginForm } from "./login-form";
import { WalletIcon } from "@/components/icons";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-[linear-gradient(160deg,#0F5A50_0%,#0B3D38_55%,#F6F8FA_55.1%)] px-4 py-6">
      <div className="flex w-full max-w-[420px] flex-col gap-5 rounded-[18px] border border-line bg-white px-6 py-7 shadow-[0_20px_40px_-24px_rgba(11,61,56,0.45)]">
        <div className="flex items-center gap-3">
          <div className="flex size-[46px] flex-none items-center justify-center rounded-xl bg-brand-2 text-white">
            <WalletIcon />
          </div>
          <div>
            <h1 className="m-0 text-lg font-bold tracking-tight">Personal Finance</h1>
            <div className="text-sm text-slate-500">Loan recovery &amp; card workspace</div>
          </div>
        </div>
        {error && (
          <div className="rounded-[10px] bg-[#FEE2E2] px-3 py-2.5 text-sm text-[#B91C1C]" role="alert">
            {error}
          </div>
        )}
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
