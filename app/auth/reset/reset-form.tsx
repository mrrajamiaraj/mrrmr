"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PasswordStrength } from "@/components/password-strength";
import { passwordProblems } from "@/lib/password";
import { resetPassword } from "./actions";

export function ResetForm() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [conf, setConf] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordProblems(pw).length) return setError("The new password does not meet all four requirements.");
    if (pw !== conf) return setError("The two new passwords do not match.");
    start(async () => {
      const r = await resetPassword(pw);
      if (r.error) setError(r.error);
      else router.replace("/");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="field-label">
        New password *
        <input className="field-input border-2 border-brand-2" type="password" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setError(""); }} />
      </label>
      <PasswordStrength value={pw} />
      <label className="field-label">
        Confirm new password *
        <input className="field-input" type="password" autoComplete="new-password" value={conf} onChange={(e) => { setConf(e.target.value); setError(""); }} />
      </label>
      {error && <div role="alert" className="rounded-md bg-bad-tint px-3.5 py-2.5 text-sm font-medium text-bad-deep">{error}</div>}
      <button type="submit" disabled={pending} className="min-h-11 rounded-md bg-brand text-[14px] font-medium text-white hover:bg-brand-hover">
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
