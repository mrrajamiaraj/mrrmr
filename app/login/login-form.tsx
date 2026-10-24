"use client";

import { useActionState } from "react";
import { signIn, forgotPassword, type AuthState } from "./actions";
import { ArrowRightIcon } from "@/components/icons";
import { Spinner } from "@/components/motion";
import { PasswordInput } from "@/components/password-input";

export function LoginForm({ next }: { next: string }) {
  const [signInState, signInAction, signingIn] = useActionState<AuthState, FormData>(signIn, {});
  const [resetState, resetAction, resetting] = useActionState<AuthState, FormData>(forgotPassword, {});
  const state = resetState.error || resetState.message ? resetState : signInState;

  return (
    <form className="flex flex-col gap-4" action={signInAction}>
      <input type="hidden" name="next" value={next} />
      <label className="field-label">
        Email
        <input className="field-input" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
      </label>
      <label className="field-label">
        Password
        <PasswordInput name="password" autoComplete="current-password" required />
      </label>

      {state.error && <div className="animate-pop-in rounded-lg border border-bad-line bg-bad-tint px-3 py-2.5 text-sm text-bad" role="alert">{state.error}</div>}
      {state.message && <div className="animate-pop-in rounded-lg border border-good-line bg-good-tint-2 px-3 py-2.5 text-sm text-brand-ink" role="status">{state.message}</div>}

      <button type="submit" disabled={signingIn}
        className="group mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand text-[14.5px] font-medium text-white shadow-[0_1px_2px_rgba(28,27,24,0.2),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-brand-hover hover:shadow-[0_8px_20px_-8px_rgba(31,77,58,0.6)]">
        {signingIn ? <><Spinner />Signing in…</> : <>Sign in<ArrowRightIcon size={16} className="transition-transform group-hover:translate-x-0.5" /></>}
      </button>
      {/* Stays after "Sign in": pressing Enter submits with the first submit button in the form. */}
      <button
        type="submit"
        formAction={resetAction}
        formNoValidate
        disabled={resetting}
        className="inline-flex min-h-9 items-center gap-2 self-center rounded-md px-2 text-[13.5px] font-medium text-brand-2 hover:bg-good-tint hover:text-brand-ink"
      >
        {resetting && <Spinner size={12} />}
        {resetting ? "Sending reset link…" : "Forgot password?"}
      </button>
    </form>
  );
}
