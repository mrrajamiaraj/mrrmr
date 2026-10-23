import { ShieldIcon } from "@/components/icons";
import { ResetForm } from "./reset-form";

export default function ResetPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-page px-4 py-8">
      <div className="flex w-full max-w-[420px] animate-pop-in flex-col gap-5 rounded-2xl border border-line bg-white px-5 py-7 shadow-[0_24px_60px_-30px_rgba(28,27,24,0.35)] sm:px-8 sm:py-9">
        <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl border border-[#CADBD0] bg-gradient-to-b from-[#F2F6F3] to-[#E6EFE9] text-brand">
          <ShieldIcon size={22} />
        </span>
        <div>
          <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em]">Set a new password</h1>
          <div className="mt-1 text-sm text-slate-500">You opened a reset link, so you don&apos;t need the old password.</div>
        </div>
        <ResetForm />
      </div>
    </main>
  );
}
