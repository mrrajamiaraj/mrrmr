"use client";

import { useActionState, useState } from "react";
import { Spinner } from "@/components/motion";
import { Turnstile } from "@/components/turnstile";
import { buttonClass } from "@/components/ui";
import { verifyMfa, type MfaState } from "@/lib/mfa-actions";

export function MfaForm({ next, siteKey, nonce }: { next: string; siteKey: string | null; nonce?: string }) {
  const [state, action, pending] = useActionState<MfaState, FormData>(verifyMfa, {});
  const [token, setToken] = useState("");

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="field-label">
        6-digit code
        <input className="field-input text-center font-mono text-[20px] tracking-[0.3em]" name="code" inputMode="numeric"
          autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
      </label>
      <Turnstile siteKey={siteKey} action="mfa" token={token} onToken={setToken} resetSignal={state} nonce={nonce} />
      {state.error && <div role="alert" className="animate-pop-in rounded-lg border border-bad-line bg-bad-tint px-3 py-2.5 text-sm text-bad">{state.error}</div>}
      <button type="submit" disabled={pending || !token} aria-busy={pending || undefined} className={buttonClass("primary", "lg")}>
        {pending ? <><Spinner />Checking…</> : !token && siteKey ? <><Spinner />Checking your browser…</> : "Continue"}
      </button>
    </form>
  );
}
