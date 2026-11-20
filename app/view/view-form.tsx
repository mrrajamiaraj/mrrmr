"use client";

import { useActionState, useState } from "react";
import { EyeIcon } from "@/components/icons";
import { Spinner } from "@/components/motion";
import { Turnstile } from "@/components/turnstile";
import { buttonClass } from "@/components/ui";
import type { AuthState } from "@/app/login/actions";
import { enterViewMode } from "./actions";

/** One button: no key is needed. View mode shows the Research ledger only and can't change anything. */
export function ViewForm({ siteKey, nonce }: { siteKey: string | null; nonce?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(enterViewMode, {});
  const [token, setToken] = useState("");

  return (
    <form className="flex flex-col gap-4" action={action}>
      <p className="m-0 rounded-lg border border-line bg-subtle px-3 py-2.5 text-[13.5px] text-slate-600">
        Read-only: you&apos;ll see the Research ledger. Nothing can be added, changed or deleted.
      </p>

      <Turnstile siteKey={siteKey} action="view" token={token} onToken={setToken} resetSignal={state} nonce={nonce} />

      {state.error && <div className="animate-pop-in rounded-lg border border-bad-line bg-bad-tint px-3 py-2.5 text-sm text-bad" role="alert">{state.error}</div>}

      <button type="submit" disabled={pending || !token} autoFocus
        aria-busy={pending || undefined} className={buttonClass("primary", "lg", "mt-1")}>
        {pending || (!token && siteKey) ? <Spinner size={16} /> : <EyeIcon size={16} />}
        {pending ? "Opening…" : !token && siteKey ? "Checking your browser…" : "Open read-only view"}
      </button>
    </form>
  );
}
