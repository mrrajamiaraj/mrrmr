"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PasswordStrength } from "@/components/password-strength";
import { Turnstile } from "@/components/turnstile";
import { passwordProblems } from "@/lib/password";
import { resetPassword } from "./actions";

export function ResetForm({ siteKey, nonce }: { siteKey: string | null; nonce?: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [conf, setConf] = useState("");
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordProblems(pw).length) return setError("The new password does not meet all four requirements.");
    if (pw !== conf) return setError("The two new passwords do not match.");
    start(async () => {
      const r = await resetPassword(pw, token);
      if (r.error) { setError(r.error); setAttempt((n) => n + 1); } // token is used up: get a fresh one
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
      <Turnstile siteKey={siteKey} action="reset" token={token} onToken={setToken} resetSignal={attempt} nonce={nonce} />
      {error && <div role="alert" className="rounded-md bg-bad-tint px-3.5 py-2.5 text-sm font-medium text-bad-deep">{error}</div>}
      <button type="submit" disabled={pending || !token} className="min-h-11 rounded-md bg-brand text-[14px] font-medium text-white hover:bg-brand-hover disabled:opacity-60">
        {pending ? "Saving…" : !token && siteKey ? "Checking your browser…" : "Save new password"}
      </button>
    </form>
  );
}
