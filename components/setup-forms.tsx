"use client";

import { useState, useTransition } from "react";
import { createAccount, createCard, updateCardDetails } from "@/lib/actions";
import { ErrorBox, Modal, btnGhost, btnPrimary } from "@/components/modal";
import { useViewer } from "@/components/shell";
import { CARD_NAMES } from "@/lib/ledger";
import type { Card } from "@/lib/types";

function Panel({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-[640px] rounded-lg border border-line bg-surface p-4 sm:p-6">
      <h2 className="m-0 text-xl font-semibold">{title}</h2>
      <p className="mb-5 mt-1 text-sm text-slate-500">{sub}</p>
      {children}
    </section>
  );
}

export function SetupAccount() {
  const viewer = useViewer();
  const [f, setF] = useState({ name: "City Bank", holder_name: "", balance: "" });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  if (viewer) return <Panel title="No bank account yet" sub="The bank account has not been set up yet, so there is nothing to show here." />;

  return (
    <Panel title="Set up your bank account" sub="There is no bank account in the database yet. Add it once and the page fills in.">
      <form
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createAccount({ name: f.name, holder_name: f.holder_name, balance: Number(f.balance || 0) });
            if (r.error) setError(r.error);
          });
        }}
      >
        <label className="field-label">Account name *<input className="field-input" value={f.name} onChange={set("name")} /></label>
        <label className="field-label">Holder name<input className="field-input" value={f.holder_name} onChange={set("holder_name")} placeholder="e.g. Raja Mia Raj" /></label>
        <label className="field-label sm:col-span-2">Money in the account now (৳)
          <input className="field-input tabular-nums" type="number" min="0" value={f.balance} onChange={set("balance")} placeholder="0" />
        </label>
        {error && <ErrorBox className="sm:col-span-2">{error}</ErrorBox>}
        <button type="submit" disabled={pending} className={`${btnPrimary} sm:col-span-2`}>{pending ? "Saving…" : "Save account"}</button>
      </form>
    </Panel>
  );
}

const CARD_DEFAULTS: Record<1 | 2, { bank: string; name: string; network: string }> = {
  1: { bank: "City Bank", name: "Amex Blue", network: "Amex Blue" },
  2: { bank: "Community Bank", name: "Visa Platinum", network: "Visa Platinum" },
};

export function SetupCard({ slot }: { slot: 1 | 2 }) {
  const d = CARD_DEFAULTS[slot];
  const viewer = useViewer();
  const [f, setF] = useState({ ...d, last4: "", credit_limit: "", balance: "", pay_by: "" });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  if (viewer) return <Panel title={`No ${CARD_NAMES[slot]} yet`} sub="This card has not been set up yet, so there is nothing to show here." />;

  return (
    <Panel title={`Set up your ${CARD_NAMES[slot]}`} sub="This card is not in the database yet. Add it once and the page fills in.">
      <form
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createCard({
              slot, bank: f.bank, name: f.name, network: f.network, last4: f.last4,
              credit_limit: f.credit_limit ? Number(f.credit_limit) : null,
              balance: Number(f.balance || 0), pay_by: f.pay_by,
            });
            if (r.error) setError(r.error);
          });
        }}
      >
        <label className="field-label">Bank *<input className="field-input" value={f.bank} onChange={set("bank")} /></label>
        <label className="field-label">Card name *<input className="field-input" value={f.name} onChange={set("name")} /></label>
        <label className="field-label">Network<input className="field-input" value={f.network} onChange={set("network")} /></label>
        <label className="field-label">Last 4 digits<input className="field-input tabular-nums" value={f.last4} onChange={set("last4")} maxLength={4} inputMode="numeric" /></label>
        <label className="field-label">Credit limit (৳)<input className="field-input tabular-nums" type="number" min="0" value={f.credit_limit} onChange={set("credit_limit")} /></label>
        <label className="field-label">Balance owed now (৳)<input className="field-input tabular-nums" type="number" min="0" value={f.balance} onChange={set("balance")} placeholder="0" /></label>
        <label className="field-label sm:col-span-2">Pay by<input className="field-input" type="date" value={f.pay_by} onChange={set("pay_by")} /></label>
        {error && <ErrorBox className="sm:col-span-2">{error}</ErrorBox>}
        <button type="submit" disabled={pending} className={`${btnPrimary} sm:col-span-2`}>{pending ? "Saving…" : "Save card"}</button>
      </form>
    </Panel>
  );
}

export function EditCardDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const [limit, setLimit] = useState(card.credit_limit == null ? "" : String(card.credit_limit));
  const [payBy, setPayBy] = useState(card.pay_by ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <Modal
      title="Card details"
      onClose={onClose}
      maxWidth={460}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button
            type="button"
            disabled={pending}
            className={btnPrimary}
            onClick={() =>
              start(async () => {
                const r = await updateCardDetails(card.id, { credit_limit: limit === "" ? null : Number(limit), pay_by: payBy });
                if (r.error) setError(r.error);
                else onClose();
              })
            }
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-5">
        <label className="field-label">Credit limit (৳)<input className="field-input tabular-nums" type="number" min="0" value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
        <label className="field-label">Pay by (this bill)<input className="field-input" type="date" value={payBy} onChange={(e) => setPayBy(e.target.value)} /></label>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}
