"use client";

import { useState } from "react";
import { KeyIcon, PersonIcon } from "@/components/icons";
import { ViewForm } from "@/app/view/view-form";
import { LoginForm } from "./login-form";

type Mode = "viewer" | "admin";

/** Shared by /login and /view: one card, Viewer (read-only key) or Admin (email + password). */
export function SignInCard({ next, error, initialMode }: { next: string; error?: string; initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const tab = (m: Mode) =>
    `inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded text-[14px] font-medium ${
      mode === m ? "bg-white text-ink shadow-[0_1px_2px_rgba(28,27,24,0.12)]" : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <main className="grid min-h-screen place-items-center bg-[#F5F4F0] px-4 py-6">
      <div className="flex w-full max-w-[400px] flex-col gap-4 rounded-lg border border-line bg-white px-6 py-7 shadow-[0_10px_30px_-20px_rgba(28,27,24,0.25)]">
        <div className="text-[15px] font-semibold text-ink">Ledger<span className="text-brand-2">.</span></div>
        <div>
          <h1 className="m-0 text-xl font-semibold text-ink">Personal Finance</h1>
          <p className="m-0 mt-0.5 text-sm text-slate-500">
            {mode === "viewer" ? "Read-only view of the finance & loan workspace." : "Sign in to add and edit records."}
          </p>
        </div>

        <div role="tablist" aria-label="Sign-in type" className="flex gap-1 rounded-md border border-line bg-[#F0EEE9] p-1">
          <button type="button" role="tab" aria-selected={mode === "viewer"} onClick={() => setMode("viewer")} className={tab("viewer")}>
            <PersonIcon size={16} />
            Viewer
          </button>
          <button type="button" role="tab" aria-selected={mode === "admin"} onClick={() => setMode("admin")} className={tab("admin")}>
            <KeyIcon size={16} />
            Admin
          </button>
        </div>

        {error && (
          <div className="rounded-md bg-[#F5E4E0] px-3 py-2.5 text-sm text-[#9B3426]" role="alert">
            {error}
          </div>
        )}
        {mode === "viewer" ? <ViewForm /> : <LoginForm next={next} />}
      </div>
    </main>
  );
}
