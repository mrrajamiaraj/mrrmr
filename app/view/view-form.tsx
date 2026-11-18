"use client";

import { useActionState } from "react";
import { LockIcon } from "@/components/icons";
import { Spinner } from "@/components/motion";
import { PasswordInput } from "@/components/password-input";
import { buttonClass } from "@/components/ui";
import type { AuthState } from "@/app/login/actions";
import { enterViewMode } from "./actions";

export function ViewForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(enterViewMode, {});

  return (
    <form className="flex flex-col gap-4" action={action}>
      <label className="field-label">
        Viewer key
        <PasswordInput name="passcode" autoComplete="off" autoFocus required placeholder="Enter the key you were given" />
      </label>

      {state.error && <div className="animate-pop-in rounded-lg border border-bad-line bg-bad-tint px-3 py-2.5 text-sm text-bad" role="alert">{state.error}</div>}

      <button type="submit" disabled={pending}
        aria-busy={pending || undefined} className={buttonClass("primary", "lg", "mt-1")}>
        {pending ? <Spinner size={16} /> : <LockIcon size={16} />}
        {pending ? "Unlocking…" : "Unlock"}
      </button>
    </form>
  );
}
