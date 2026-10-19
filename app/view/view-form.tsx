"use client";

import { useActionState } from "react";
import { LockIcon } from "@/components/icons";
import type { AuthState } from "@/app/login/actions";
import { enterViewMode } from "./actions";

export function ViewForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(enterViewMode, {});

  return (
    <form className="flex flex-col gap-3.5" action={action}>
      <label className="field-label">
        Viewer key
        <input className="field-input focus:border-[#0D9488]" name="passcode" type="password" autoComplete="off" autoFocus required />
      </label>

      {state.error && <div className="rounded-[10px] bg-[#FEE2E2] px-3 py-2.5 text-sm text-[#B91C1C]" role="alert">{state.error}</div>}

      <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-brand-2 text-[15px] font-semibold text-white" disabled={pending}>
        <LockIcon size={16} />
        {pending ? "Unlocking…" : "Unlock"}
      </button>
    </form>
  );
}
