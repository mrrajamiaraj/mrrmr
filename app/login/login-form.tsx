"use client";

import { useActionState } from "react";
import { signIn, forgotPassword, type AuthState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [signInState, signInAction, signingIn] = useActionState<AuthState, FormData>(signIn, {});
  const [resetState, resetAction, resetting] = useActionState<AuthState, FormData>(forgotPassword, {});
  const state = resetState.error || resetState.message ? resetState : signInState;

  return (
    <form className="flex flex-col gap-3.5" action={signInAction}>
      <input type="hidden" name="next" value={next} />
      <label className="field-label">
        Email
        <input className="field-input focus:border-[#2E6B52]" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="field-label">
        Password
        <input className="field-input focus:border-[#2E6B52]" name="password" type="password" autoComplete="current-password" required />
      </label>

      {state.error && <div className="rounded-md bg-[#F5E4E0] px-3 py-2.5 text-sm text-[#9B3426]" role="alert">{state.error}</div>}
      {state.message && <div className="rounded-md bg-[#E3ECE6] px-3 py-2.5 text-sm text-[#1F4D3A]" role="status">{state.message}</div>}

      <button type="submit" className="min-h-11 rounded-md bg-brand text-[14px] font-medium text-white hover:bg-[#173D2E]" disabled={signingIn}>
        {signingIn ? "Signing in…" : "Sign in"}
      </button>
      <button
        type="submit"
        formAction={resetAction}
        formNoValidate
        disabled={resetting}
        className="min-h-10 self-start px-1 text-[14.5px] font-semibold text-brand-2"
      >
        {resetting ? "Sending…" : "Forgot password?"}
      </button>
    </form>
  );
}
