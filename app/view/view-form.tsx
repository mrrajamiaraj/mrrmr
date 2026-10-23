"use client";

import { useActionState } from "react";
import { LockIcon } from "@/components/icons";
import { Spinner } from "@/components/motion";
import { PasswordInput } from "@/components/password-input";
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

      {state.error && <div className="animate-pop-in rounded-lg border border-[#EBCFC8] bg-[#F5E4E0] px-3 py-2.5 text-sm text-[#9B3426]" role="alert">{state.error}</div>}

      <button type="submit" disabled={pending}
        className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand text-[14.5px] font-medium text-white shadow-[0_1px_2px_rgba(28,27,24,0.2),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-[#173D2E] hover:shadow-[0_8px_20px_-8px_rgba(31,77,58,0.6)]">
        {pending ? <Spinner size={16} /> : <LockIcon size={16} />}
        {pending ? "Unlocking…" : "Unlock"}
      </button>
    </form>
  );
}
