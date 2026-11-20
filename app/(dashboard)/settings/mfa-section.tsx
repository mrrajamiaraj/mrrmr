"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard, SectionHead } from "@/components/debtors/bits";
import { Button } from "@/components/ui";
import { toast } from "@/components/toast";
import { confirmTotpEnroll, removeTotp, startTotpEnroll } from "@/lib/mfa-actions";

/** Settings → Two-step sign-in: add (QR + manual secret + first code) or remove an authenticator app. */
export function MfaSection({ factorId, aal }: { factorId: string | null; aal: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");

  const run = (fn: () => Promise<{ error?: string } | void>) => start(async () => {
    setError("");
    const r = await fn();
    if (r && r.error) setError(r.error);
  });

  return (
    <SectionCard labelledBy="mfa-h">
      <SectionHead id="mfa-h" title="Two-step sign-in"
        sub={factorId ? "On: signing in asks for a code from your authenticator app." : "Off: add an authenticator app (Google Authenticator, 1Password, Authy…) for a second step after your password."} />
      <div className="flex flex-col gap-4 border-t border-line p-4 sm:p-5">
        {factorId ? (
          <>
            <p className="m-0 text-[14px] text-slate-600">
              This session {aal === "aal2" ? "used your code" : "did not use a code"}. To remove the authenticator, sign in again with your code and remove it within 10 minutes.
              {" "}<b className="font-semibold text-ink">Once database migration 0014 is applied, the database only answers sessions that used a code, so removing it hides your data until you add one again.</b>
            </p>
            <div><Button variant="danger" pending={pending} pendingLabel="Removing…" onClick={() => run(async () => {
              const r = await removeTotp(factorId);
              if (!r.error) { toast("Authenticator removed."); router.refresh(); }
              return r;
            })}>Remove authenticator</Button></div>
          </>
        ) : setup ? (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {/* Supabase returns the QR as an SVG data URL (allowed by img-src data:). */}
              <img src={setup.qr} alt="QR code to add MRRMR to your authenticator app" width={176} height={176} className="rounded-lg border border-line bg-white p-2" />
              <div className="flex flex-col gap-2 text-[14px]">
                <span>1. Scan the code with your authenticator app, or type this key:</span>
                <code className="break-all rounded-md bg-subtle px-2 py-1.5 font-mono text-[13px]">{setup.secret}</code>
                <span>2. Enter the 6-digit code it shows.</span>
              </div>
            </div>
            <label className="field-label max-w-[220px]">6-digit code
              <input className="field-input text-center font-mono tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code"
                maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <div className="flex gap-2">
              <Button pending={pending} pendingLabel="Checking…" onClick={() => run(async () => {
                const r = await confirmTotpEnroll(setup.factorId, code);
                if (!r.error) { setSetup(null); setCode(""); toast("Two-step sign-in is on."); router.refresh(); }
                return r;
              })}>Turn on</Button>
              <Button variant="ghost" onClick={() => { setSetup(null); setCode(""); }}>Cancel</Button>
            </div>
          </>
        ) : (
          <div><Button pending={pending} pendingLabel="Preparing…" onClick={() => run(async () => {
            const r = await startTotpEnroll();
            if (r.factorId && r.qr && r.secret) setSetup({ factorId: r.factorId, qr: r.qr, secret: r.secret });
            return r;
          })}>Add authenticator app</Button></div>
        )}
        {error && <div role="alert" className="text-[13.5px] font-medium text-bad">{error}</div>}
      </div>
    </SectionCard>
  );
}
