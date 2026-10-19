"use client";

import { useState } from "react";
import { KeyIcon, PersonIcon, WalletIcon } from "@/components/icons";
import { ViewForm } from "@/app/view/view-form";
import { LoginForm } from "./login-form";

type Mode = "viewer" | "admin";

/** Shared by /login and /view: one card, Viewer (read-only key) or Admin (email + password). */
export function SignInCard({ next, error, initialMode }: { next: string; error?: string; initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const tab = (m: Mode) =>
    `inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[10px] text-[16px] font-semibold ${
      mode === m ? "bg-white text-brand shadow-[0_1px_3px_rgba(15,23,42,0.12)]" : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <main className="grid min-h-screen place-items-center bg-[#F6F8FA] px-4 py-6">
      <div className="flex w-full max-w-[600px] flex-col gap-6 rounded-[18px] border border-line bg-white px-[clamp(20px,6vw,42px)] py-[clamp(24px,6vw,46px)] shadow-[0_10px_30px_-20px_rgba(15,23,42,0.25)]">
        <div className="flex size-[68px] items-center justify-center rounded-2xl bg-brand-2 text-white">
          <WalletIcon size={32} />
        </div>
        <div>
          <h1 className="m-0 text-[clamp(24px,4vw,30px)] font-bold tracking-tight text-ink">Personal Finance</h1>
          <p className="m-0 mt-1 text-[17px] text-slate-500">
            {mode === "viewer" ? "Read-only view of the finance & loan workspace." : "Sign in to add and edit records."}
          </p>
        </div>

        <div role="tablist" aria-label="Sign-in type" className="flex gap-1 rounded-xl border border-line bg-[#F1F5F9] p-1.5">
          <button type="button" role="tab" aria-selected={mode === "viewer"} onClick={() => setMode("viewer")} className={tab("viewer")}>
            <PersonIcon size={18} />
            Viewer
          </button>
          <button type="button" role="tab" aria-selected={mode === "admin"} onClick={() => setMode("admin")} className={tab("admin")}>
            <KeyIcon size={18} />
            Admin
          </button>
        </div>

        {error && (
          <div className="rounded-[10px] bg-[#FEE2E2] px-3 py-2.5 text-sm text-[#B91C1C]" role="alert">
            {error}
          </div>
        )}
        {mode === "viewer" ? <ViewForm /> : <LoginForm next={next} />}
      </div>
    </main>
  );
}
