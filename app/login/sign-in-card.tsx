"use client";

import { useState } from "react";
import { BankIcon, CardIcon, KeyIcon, PeopleIcon, PersonIcon, ShieldIcon } from "@/components/icons";
import { ViewForm } from "@/app/view/view-form";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { LoginForm } from "./login-form";

type Mode = "viewer" | "admin";

const FEATURES = [
  { icon: BankIcon, title: "Bank balance, now and after", text: "See what's in the account and what it becomes once everyone pays back." },
  { icon: PeopleIcon, title: "Every debtor in one place", text: "Loans, card use and repayments, with a full history per person." },
  { icon: CardIcon, title: "Credit cards, tracked", text: "Available limit today and what frees up as people repay." },
];

/** Brand panel depth: layers drift against the pointer, read from --px / --py (−1…1). */
function parallax(e: React.PointerEvent<HTMLElement>) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--px", String(((e.clientX - r.left) / r.width) * 2 - 1));
  e.currentTarget.style.setProperty("--py", String(((e.clientY - r.top) / r.height) * 2 - 1));
}

/** Shared by /login and /view: one card, Viewer (read-only key) or Admin (email + password). */
export function SignInCard({ next, error, initialMode, adminSignedIn = false, siteKey, nonce }: {
  next: string; error?: string; initialMode: Mode; adminSignedIn?: boolean; siteKey: string | null; nonce?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const tab = (m: Mode) =>
    `relative z-10 inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md text-[14px] font-medium ${
      mode === m ? "text-ink" : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <main className="grid min-h-dvh bg-page lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel: large screens only. */}
      <section aria-hidden="true" onPointerMove={parallax} onPointerLeave={(e) => { e.currentTarget.style.setProperty("--px", "0"); e.currentTarget.style.setProperty("--py", "0"); }}
        className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#0E5A48,#083529)] text-white dark:bg-[linear-gradient(160deg,#0F2A24,#0A0D13)] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px] [translate:calc(var(--px,0)*-8px)_calc(var(--py,0)*-8px)] transition-[translate] duration-700 ease-out" />
        <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(201,217,207,0.35),transparent_65%)] [translate:calc(var(--px,0)*24px)_calc(var(--py,0)*24px)] transition-[translate] duration-700 ease-out" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[460px] rounded-full bg-[radial-gradient(circle,rgba(46,107,82,0.9),transparent_70%)] [translate:calc(var(--px,0)*-18px)_calc(var(--py,0)*-18px)] transition-[translate] duration-700 ease-out" />

        {/* A floating glimpse of the workspace: decorative shapes only, no figures. */}
        <div className="pointer-events-none absolute right-[-64px] top-[calc(50%-110px)] hidden w-[300px] [translate:calc(var(--px,0)*-14px)_calc(var(--py,0)*-14px)] transition-[translate] duration-500 ease-out 2xl:block">
        <div className="animate-pop-in rounded-2xl border border-white/15 bg-white/[0.07] p-5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)] backdrop-blur-md [animation-delay:350ms]">
          <div className="mb-4 flex items-center gap-2">
            <span className="size-2 rounded-full bg-mint" />
            <span className="h-2 w-24 rounded-full bg-white/25" />
          </div>
          <div className="flex h-24 items-end gap-2">
            {[38, 62, 45, 80, 56, 92, 70].map((h, i) => (
              <span key={i} className="flex flex-1 items-end gap-[2px]">
                <span className="flex-1 origin-bottom animate-grow-y rounded-t-[3px] bg-[#D9B46A]/80" style={{ height: `${h}%`, animationDelay: `${450 + i * 60}ms` }} />
                <span className="flex-1 origin-bottom animate-grow-y rounded-t-[3px] bg-mint/80" style={{ height: `${h * 0.7}%`, animationDelay: `${480 + i * 60}ms` }} />
              </span>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4">
            <span className="size-8 rounded-full bg-white/15" />
            <span className="flex flex-auto flex-col gap-1.5">
              <span className="h-2 w-3/4 rounded-full bg-white/25" />
              <span className="h-1.5 overflow-hidden rounded-full bg-white/10"><span className="bar-fill block h-full w-2/3 rounded-full bg-mint [animation-delay:700ms]" /></span>
            </span>
          </div>
        </div>
        </div>

        <div className="relative animate-fade-up text-[18px]">
          <Wordmark size={38} light tagline />
        </div>

        <div className="relative flex max-w-[480px] flex-col gap-8">
          <h2 className="m-0 animate-fade-up font-display text-[46px] font-normal leading-[1.04] tracking-[-0.01em] [animation-delay:80ms]">
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

      <div className="relative grid place-items-center px-4 pb-[max(32px,env(safe-area-inset-bottom))] pt-16 lg:py-8">
        <div className="absolute right-4 top-[max(16px,env(safe-area-inset-top))]"><ThemeToggle /></div>
        <div className="flex w-full max-w-[420px] animate-pop-in flex-col gap-5 rounded-2xl border border-line bg-surface px-5 py-7 shadow-[0_24px_60px_-30px_rgba(28,27,24,0.35)] sm:px-8 sm:py-9">
          <div className="text-[16px] lg:hidden">
            <Wordmark size={32} />
          </div>
          <div>
            <h1 className="m-0 font-display text-[32px] font-normal leading-tight text-ink">Welcome back</h1>
            <p key={mode} className="m-0 mt-1 animate-fade-in text-[14px] text-slate-500">
              {mode === "viewer" ? "Open a read-only view of the Research ledger. No key needed." : "Sign in as admin to add and edit records."}
            </p>
          </div>

          <div role="tablist" aria-label="Sign-in type" className="relative flex gap-1 rounded-lg border border-line bg-soft p-1">
            {/* Sliding thumb under the selected option. */}
            <span aria-hidden="true"
              className={`absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-md bg-surface shadow-[0_1px_3px_rgba(28,27,24,0.14)] transition-transform duration-300 ease-[var(--ease-out-expo)] ${mode === "admin" ? "translate-x-[calc(100%+4px)]" : ""}`} />
            <button type="button" role="tab" aria-selected={mode === "viewer"} onClick={() => setMode("viewer")} className={tab("viewer")}>
              <PersonIcon size={16} />
              Viewer
            </button>
            <button type="button" role="tab" aria-selected={mode === "admin"} onClick={() => setMode("admin")} className={tab("admin")}>
              <KeyIcon size={16} />
              Admin
            </button>
          </div>

          {adminSignedIn && (
            <div role="status" className="rounded-lg border border-owed-line bg-owed-tint px-3 py-2.5 text-[13.5px] text-slate-700">
              <b className="font-semibold text-ink">You&apos;re signed in as the admin on this browser.</b>{" "}
              {mode === "viewer"
                ? "Opening the read-only view signs you out as admin here first."
                : <>Go to <a href="/" className="font-medium text-brand-2 underline underline-offset-2">your dashboard</a>.</>}
            </div>
          )}
          {error && (
            <div className="animate-pop-in rounded-lg border border-bad-line bg-bad-tint px-3 py-2.5 text-sm text-bad" role="alert">
              {error}
            </div>
          )}
          <div key={mode} className="animate-fade-up">
            {mode === "viewer" ? <ViewForm siteKey={siteKey} nonce={nonce} /> : <LoginForm next={next} siteKey={siteKey} nonce={nonce} />}
          </div>
        </div>
      </div>
    </main>
  );
}
