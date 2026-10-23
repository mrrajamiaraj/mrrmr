"use client";

import { useState } from "react";
import { BankIcon, CardIcon, KeyIcon, PeopleIcon, PersonIcon, ShieldIcon } from "@/components/icons";
import { ViewForm } from "@/app/view/view-form";
import { LoginForm } from "./login-form";

type Mode = "viewer" | "admin";

const FEATURES = [
  { icon: BankIcon, title: "Bank balance, now and after", text: "See what's in the account and what it becomes once everyone pays back." },
  { icon: PeopleIcon, title: "Every debtor in one place", text: "Loans, card use and repayments, with a full history per person." },
  { icon: CardIcon, title: "Credit cards, tracked", text: "Available limit today and what frees up as people repay." },
];

/** Shared by /login and /view: one card, Viewer (read-only key) or Admin (email + password). */
export function SignInCard({ next, error, initialMode }: { next: string; error?: string; initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const tab = (m: Mode) =>
    `relative z-10 inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md text-[14px] font-medium ${
      mode === m ? "text-ink" : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <main className="grid min-h-dvh bg-page lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel: large screens only. */}
      <section aria-hidden="true" className="relative hidden overflow-hidden bg-brand text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(201,217,207,0.35),transparent_65%)]" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[460px] rounded-full bg-[radial-gradient(circle,rgba(46,107,82,0.9),transparent_70%)]" />

        <div className="relative flex animate-fade-up items-center gap-2.5 text-[17px] font-semibold">
          <span className="grid size-9 place-items-center rounded-lg bg-white text-[15px] text-brand">L</span>
          <span>Ledger<span className="text-mint">.</span></span>
        </div>

        <div className="relative flex max-w-[480px] flex-col gap-8">
          <h2 className="m-0 animate-fade-up text-[38px] font-semibold leading-[1.1] tracking-[-0.03em] [animation-delay:80ms]">
            Know exactly where every taka is.
          </h2>
          <ul className="m-0 flex list-none flex-col gap-5 p-0">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex animate-fade-up gap-3.5" style={{ animationDelay: `${160 + i * 80}ms` }}>
                <span className="grid size-10 flex-none place-items-center rounded-lg border border-white/15 bg-white/10 backdrop-blur"><Icon size={19} /></span>
                <div>
                  <div className="font-medium">{title}</div>
                  <div className="text-[14px] text-white/65">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex animate-fade-in items-center gap-2 text-[13px] text-white/55 [animation-delay:500ms]">
          <ShieldIcon size={16} /> Private workspace. Viewers can look; only the admin can change records.
        </div>
      </section>

      <div className="grid place-items-center px-4 py-8">
        <div className="flex w-full max-w-[420px] animate-pop-in flex-col gap-5 rounded-2xl border border-line bg-white px-5 py-7 shadow-[0_24px_60px_-30px_rgba(28,27,24,0.35)] sm:px-8 sm:py-9">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-ink lg:hidden">
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-brand text-[13px] text-white">L</span>
            <span>Ledger<span className="text-brand-2">.</span></span>
          </div>
          <div>
            <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em] text-ink">Welcome back</h1>
            <p key={mode} className="m-0 mt-1 animate-fade-in text-[14px] text-slate-500">
              {mode === "viewer" ? "Enter the viewer key for a read-only look at the workspace." : "Sign in as admin to add and edit records."}
            </p>
          </div>

          <div role="tablist" aria-label="Sign-in type" className="relative flex gap-1 rounded-lg border border-line bg-soft p-1">
            {/* Sliding thumb under the selected option. */}
            <span aria-hidden="true"
              className={`absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-md bg-white shadow-[0_1px_3px_rgba(28,27,24,0.14)] transition-transform duration-300 ease-[var(--ease-out-expo)] ${mode === "admin" ? "translate-x-[calc(100%+4px)]" : ""}`} />
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
            <div className="animate-pop-in rounded-lg border border-[#EBCFC8] bg-[#F5E4E0] px-3 py-2.5 text-sm text-[#9B3426]" role="alert">
              {error}
            </div>
          )}
          <div key={mode} className="animate-fade-up">
            {mode === "viewer" ? <ViewForm /> : <LoginForm next={next} />}
          </div>
        </div>
      </div>
    </main>
  );
}
