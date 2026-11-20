"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal, ErrorBox } from "@/components/modal";
import { Badge, Button, Money } from "@/components/ui";
import { AlertIcon, InfoIcon, TrashIcon } from "@/components/icons";
import { useViewer } from "@/components/shell";
import { deleteEntries } from "@/lib/actions";
import { deletionImpact, type DeleteItem } from "@/lib/deletion";
import { dateLong, taka } from "@/lib/format";
import type { FinanceData } from "@/lib/types";

type Answer = "yes" | "no" | "unsure";

/**
 * Confirm a permanent deletion with an impact preview: the entries involved, what each affected person will owe
 * afterwards, EMI plans that disappear, split-purchase shares that stay, and — for every linked bank or card balance —
 * an explicit question about whether saving those entries changed it. Nothing is reversed on a guess: "Not sure"
 * keeps the records. Everything is applied in one transaction (lib/actions → delete_records).
 */
export function DeleteDialog({ data, today, items, title, personId, personName, wholeHistory = false, onClose, onDone }: {
  data: FinanceData;
  today: string;
  items: DeleteItem[];
  title: string;
  personId?: string;
  personName?: string;
  /** deleting everything for one person: offers "also remove the person" and asks for their name */
  wholeHistory?: boolean;
  onClose: () => void;
  onDone: (message: string, removedPerson: boolean) => void;
}) {
  const viewer = useViewer();
  const router = useRouter();
  const x = useMemo(() => deletionImpact(data, today, items), [data, today, items]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [removePerson, setRemovePerson] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (viewer) return null;

  const n = x.entries.length;
  const unanswered = x.groups.filter((g) => !answers[g.key]);
  const unsure = x.groups.filter((g) => answers[g.key] === "unsure");
  const confirmWord = (personName ?? "").trim().split(/\s+/)[0] ?? "";
  const needsName = wholeHistory && n > 0;
  const nameOk = !needsName || typed.trim().toLowerCase() === confirmWord.toLowerCase();
  const blocked = unanswered.length > 0 || unsure.length > 0 || !nameOk || (n === 0 && !removePerson);
  const reason = unanswered.length ? `Answer ${unanswered.length === 1 ? "the balance question" : `all ${x.groups.length} balance questions`} first.`
    : unsure.length ? "Not sure keeps the records — check your bank or card statement first."
    : !nameOk ? `Type ${confirmWord} to confirm.` : "";
  const shown = x.entries.slice(0, 6);

  function run() {
    setError("");
    start(async () => {
      const r = await deleteEntries({
        entries: x.entries.map((e) => ({ kind: e.kind, id: e.id, undo: !!e.group && answers[e.group] === "yes" })),
        personId: personId ?? null,
        removePerson: wholeHistory && removePerson,
      });
      if (r.error) return setError(r.error);
      const reversed = x.groups.filter((g) => answers[g.key] === "yes");
      const msg = r.already ? "Those entries were already deleted. Nothing changed."
        : `Deleted ${n} ${n === 1 ? "entry" : "entries"}${reversed.length ? ` and updated ${[...new Set(reversed.map((g) => g.place))].join(" and ")}` : ""}${wholeHistory && removePerson ? `, and removed ${personName}` : ""}.`;
      onDone(msg, wholeHistory && removePerson);
      if (!(wholeHistory && removePerson)) router.refresh();
    });
  }

  return (
    <Modal title={title} onClose={onClose} maxWidth={560}
      footer={<>
        {blocked && reason && <span className="mr-auto text-[12.5px] text-slate-500">{reason}</span>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={run} disabled={blocked} pending={pending} pendingLabel="Deleting…">
          <TrashIcon size={15} />{n ? `Delete ${n} ${n === 1 ? "entry" : "entries"}` : "Remove person"}
        </Button>
      </>}>
      <div className="flex flex-col gap-4 p-5 text-[14px]">
        {x.missing.length > 0 && (
          <p className="m-0 rounded-lg border border-info-line bg-info-tint px-3 py-2 text-[13px] text-info">
            {x.missing.length} {x.missing.length === 1 ? "entry was" : "entries were"} already deleted and {x.missing.length === 1 ? "is" : "are"} not included.
          </p>
        )}

        {/* What will be deleted */}
        <section aria-label="Entries to delete" className="flex flex-col gap-1.5">
          <h3 className="eyebrow m-0">{n ? `${n} ${n === 1 ? "entry" : "entries"}, permanently` : "No entries"}</h3>
          {n > 0 && (
            <ul className="m-0 flex list-none flex-col divide-y divide-soft overflow-hidden rounded-xl border border-line p-0">
              {shown.map((e) => (
                <li key={`${e.kind}:${e.id}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.label}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
                      {dateLong(e.iso)}
                      {e.emi && <Badge tone="info" className="text-[10.5px]">EMI plan</Badge>}
                      {e.split && <Badge className="text-[10.5px]">Split share</Badge>}
                    </span>
                  </span>
                  <Money value={e.amount} className="flex-none" />
                </li>
              ))}
              {n > shown.length && <li className="px-3 py-2 text-[12.5px] text-slate-500">+ {n - shown.length} more</li>}
            </ul>
          )}
        </section>

        {/* What changes */}
        {(x.people.length > 0 || x.emiPlans > 0 || x.sharedKept > 0 || x.excess > 0) && (
          <section aria-label="What changes" className="flex flex-col gap-2">
            <h3 className="eyebrow m-0">What changes</h3>
            <dl className="m-0 flex flex-col gap-1.5 rounded-xl bg-subtle p-3 text-[13px]">
              {x.people.map((p) => (
                <div key={p.personId} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <dt className="text-slate-600">{p.name} owes</dt>
                  <dd className="m-0"><Money value={p.before} tone="muted" /> → <Money value={p.after} tone={p.after > p.before ? "bad" : "owed"} /></dd>
                </div>
              ))}
              {x.emiPlans > 0 && <div className="text-slate-600">{x.emiPlans} EMI {x.emiPlans === 1 ? "schedule is" : "schedules are"} removed with {x.emiPlans === 1 ? "its purchase" : "their purchases"}.</div>}
              {x.sharedKept > 0 && <div className="text-slate-600">{x.sharedKept} other {x.sharedKept === 1 ? "share" : "shares"} of the same split purchase {x.sharedKept === 1 ? "stays" : "stay"} — only the selected share is deleted.</div>}
              {x.repaymentTotal > 0 && x.people.some((p) => p.after > p.before) && <div className="text-slate-600">Deleting a repayment means it no longer counts, so what they owe goes up.</div>}
              {x.excess > 0 && (
                <div className="flex gap-1.5 font-medium text-owed"><AlertIcon size={14} className="mt-0.5 flex-none" />
                  {taka(x.excess)} of repayments would be left with nothing to pay off (shown as an overpayment in Data checks).</div>
              )}
            </dl>
          </section>
        )}

        {/* One explicit question per linked balance */}
        {x.groups.length > 0 && (
          <section aria-label="Linked balances" className="flex flex-col gap-2">
            <h3 className="eyebrow m-0">Linked balances</h3>
            <p className="m-0 text-[12.5px] text-slate-500">
              MRRMR doesn&apos;t store whether saving an entry changed a balance, so it asks. Answer from memory or your statement.
            </p>
            {x.groups.map((g) => (
              <fieldset key={g.key} className="m-0 flex flex-col gap-1.5 rounded-xl border border-line p-3">
                <legend className="px-1 text-[13.5px] font-medium">{g.question}</legend>
                {([["yes", `Yes — ${g.reversal}`], ["no", "No — just remove it from history"], ["unsure", "Not sure — keep the records"]] as [Answer, string][]).map(([v, l]) => (
                  <label key={v} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 text-[13.5px] hover:bg-subtle">
                    <input type="radio" name={g.key} value={v} checked={answers[g.key] === v} onChange={() => setAnswers((a) => ({ ...a, [g.key]: v }))}
                      className="size-[18px] flex-none accent-brand-2" />
                    {l}
                  </label>
                ))}
              </fieldset>
            ))}
          </section>
        )}

        {wholeHistory && (
          <section aria-label="Confirm" className="flex flex-col gap-2.5">
            <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px]">
              <input type="checkbox" checked={removePerson} onChange={(e) => setRemovePerson(e.target.checked)} className="mt-0.5 size-[18px] flex-none accent-bad" />
              <span>Also remove {personName} from People<span className="block text-[12px] text-slate-500">Leave unticked to keep them so you can add new entries later.</span></span>
            </label>
            {needsName && (
              <label className="field-label">Type <span className="font-semibold text-ink">{confirmWord}</span> to confirm
                <input className="field-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
              </label>
            )}
          </section>
        )}

        <p className="m-0 flex gap-2 text-[12.5px] text-slate-500">
          <InfoIcon size={14} className="mt-0.5 flex-none" />
          This can&apos;t be undone. Everything above happens together or not at all. Export a PDF or CSV first if you want a copy.
        </p>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}
