import { ResetForm } from "./reset-form";

export default function ResetPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[linear-gradient(160deg,#0F5A50_0%,#0B3D38_55%,#F6F8FA_55.1%)] px-4 py-6">
      <div className="flex w-full max-w-[460px] flex-col gap-5 rounded-[18px] border border-line bg-white px-6 py-7 shadow-[0_20px_40px_-24px_rgba(11,61,56,0.45)]">
        <div>
          <h1 className="m-0 text-xl font-bold">Set a new password</h1>
          <div className="text-sm text-slate-500">You opened a reset link, so you don&apos;t need the old password.</div>
        </div>
        <ResetForm />
      </div>
    </main>
  );
}
