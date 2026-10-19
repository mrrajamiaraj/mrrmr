import { ResetForm } from "./reset-form";

export default function ResetPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-page px-4 py-6">
      <div className="flex w-full max-w-[400px] flex-col gap-5 rounded-lg border border-line bg-white px-6 py-7 shadow-[0_10px_30px_-20px_rgba(28,27,24,0.25)]">
        <div>
          <h1 className="m-0 text-xl font-semibold">Set a new password</h1>
          <div className="text-sm text-slate-500">You opened a reset link, so you don&apos;t need the old password.</div>
        </div>
        <ResetForm />
      </div>
    </main>
  );
}
