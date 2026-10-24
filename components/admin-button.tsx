"use client";

import { useState, useTransition } from "react";
import { LockIcon, LogoutIcon } from "@/components/icons";
import { Modal, ErrorBox, btnGhost, btnPrimary } from "@/components/modal";
import { PasswordStrength } from "@/components/password-strength";
import { changePassword, sendPasswordReset } from "@/lib/actions";
import { signOut } from "@/app/login/actions";
import { passwordProblems } from "@/lib/password";

export function AdminButton({ email, lastChanged }: { email: string; lastChanged: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Admin"
        className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-line px-2.5 text-[13.5px] text-slate-700 hover:bg-soft sm:px-3"
      >
        <LockIcon size={14} />
        <span className="hidden sm:inline">Admin</span>
      </button>
      {open && <AdminDialog email={email} lastChanged={lastChanged} onClose={() => setOpen(false)} />}
    </>
  );
}

function AdminDialog({ email, lastChanged, onClose }: { email: string; lastChanged: string; onClose: () => void }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [conf, setConf] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();
  const type = show ? "text" : "password";
  const reset = () => { setError(""); setDone(""); };

  function submit() {
    const err = !cur ? "Enter your current password."
      : passwordProblems(nw).length ? "The new password does not meet all four requirements."
      : nw === cur ? "The new password must be different from the current one."
      : nw !== conf ? "The two new passwords do not match." : "";
    if (err) return setError(err);
    start(async () => {
      const r = await changePassword(cur, nw, conf);
      if (r.error) return setError(r.error);
      setCur(""); setNw(""); setConf("");
      setDone("Admin password updated. Use the new password next time you sign in.");
    });
  }

  function forgot() {
    start(async () => {
      const r = await sendPasswordReset();
      if (r.error) setError(r.error);
      else setDone(`A reset link was sent to ${email}.`);
    });
  }

  return (
    <Modal
      title={<><LockIcon size={20} />Admin password</>}
      onClose={onClose}
      maxWidth={520}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2.5">
          <button type="button" onClick={forgot} disabled={pending} className="min-h-11 px-1 text-[14.5px] font-semibold text-brand-2">
            Forgot password?
          </button>
          <div className="flex gap-2.5">
            <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
            <button type="button" onClick={submit} disabled={pending} className={btnPrimary}>
              {pending ? "Updating…" : "Update password"}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3 rounded-lg border border-good-line bg-good-tint px-3.5 py-3">
          <span className="inline-flex size-[38px] flex-none items-center justify-center rounded-full bg-brand font-semibold text-white">A</span>
          <div className="min-w-0 flex-auto">
            <div className="font-semibold">Signed in as Admin</div>
            <div className="truncate text-[13.5px] text-slate-600">{email} · Password last changed {lastChanged}</div>
          </div>
          <form action={signOut}>
            <button type="submit" aria-label="Sign out" title="Sign out" className="flex size-11 items-center justify-center rounded-md text-slate-600 hover:bg-surface">
              <LogoutIcon size={18} />
            </button>
          </form>
        </div>

        <label className="field-label">
          Current password *
          <input type={type} value={cur} onChange={(e) => { setCur(e.target.value); reset(); }} autoComplete="current-password" placeholder="Enter current password" className="field-input" />
        </label>
        <label className="field-label">
          New password *
          <input type={type} value={nw} onChange={(e) => { setNw(e.target.value); reset(); }} autoComplete="new-password" placeholder="At least 8 characters" className="field-input border-2 border-brand-2" />
        </label>
        <PasswordStrength value={nw} />
        <label className="field-label">
          Confirm new password *
          <input type={type} value={conf} onChange={(e) => { setConf(e.target.value); reset(); }} autoComplete="new-password" placeholder="Type the new password again" className="field-input" />
        </label>
        {conf.length > 0 && (
          <div className="-mt-2 text-[13.5px] font-semibold" style={{ color: conf === nw ? "var(--color-brand-2)" : "var(--color-bad)" }}>
            {conf === nw ? "✓ Passwords match" : "Passwords do not match yet"}
          </div>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14.5px]">
          <input type="checkbox" checked={show} onChange={() => setShow(!show)} className="size-[18px] accent-brand-2" />
          Show passwords
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
        {done && <div role="status" className="rounded-md bg-good-tint-2 px-3.5 py-2.5 text-sm font-medium text-brand-ink">{done}</div>}
      </div>
    </Modal>
  );
}
