import Link from "next/link";
import { ViewForm } from "./view-form";
import { EyeIcon } from "@/components/icons";

export default function ViewPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[linear-gradient(160deg,#0F5A50_0%,#0B3D38_55%,#F6F8FA_55.1%)] px-4 py-6">
      <div className="flex w-full max-w-[420px] flex-col gap-5 rounded-[18px] border border-line bg-white px-6 py-7 shadow-[0_20px_40px_-24px_rgba(11,61,56,0.45)]">
        <div className="flex items-center gap-3">
          <div className="flex size-[46px] flex-none items-center justify-center rounded-xl bg-brand-2 text-white">
            <EyeIcon />
          </div>
          <div>
            <h1 className="m-0 text-lg font-bold tracking-tight">View mode</h1>
            <div className="text-sm text-slate-500">See every page, read-only. Nothing can be changed.</div>
          </div>
        </div>
        <ViewForm />
        <Link href="/login" className="self-start px-1 text-[14.5px] font-semibold text-brand-2">Admin sign in →</Link>
      </div>
    </main>
  );
}
