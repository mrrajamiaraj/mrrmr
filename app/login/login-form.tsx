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
        <input className="field-input focus:border-[#0D9488]" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="field-label">
        Password
        <input className="field-input focus:border-[#0D9488]" name="password" type="password" autoComplete="current-password" required />
      </label>

      {state.error && <div className="rounded-[10px] bg-[#FEE2E2] px-3 py-2.5 text-sm text-[#B91C1C]" role="alert">{state.error}</div>}
      {state.message && <div className="rounded-[10px] bg-[#D1FAE5] px-3 py-2.5 text-sm text-[#065F46]" role="status">{state.message}</div>}

      <button type="submit" className="min-h-11 rounded-[10px] bg-brand text-[15px] font-semibold text-white" disabled={signingIn}>
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
