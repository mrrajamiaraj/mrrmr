"use client";

import { useMemo, useState } from "react";
import { Shell, HeaderButton, useViewer } from "@/components/shell";
import { PersonIcon } from "@/components/icons";
import { BalanceEditor, Figure, Statement } from "@/components/balance-editor";
import { ProfileSlider } from "@/components/debtors/profile-slider";
import { ProfileModal } from "@/components/debtors/profile-modal";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { DuePill, Flash, PersonButton, SectionCard, SectionHead, td, th, theadRow, totalRow } from "@/components/debtors/bits";
import { EditCardDialog, SetupCard } from "@/components/setup-forms";
import { DeleteButton, DeleteRecordDialog, undoText, type DeleteTarget } from "@/components/delete-record-dialog";
import { CardVisual } from "@/components/card-visual";
import { FlowChart, OUT_COLOR, Ring, type Flow } from "@/components/charts";
import { SortTh, useSort } from "@/components/sortable";
import { usePalettePeople } from "@/components/command-palette";
import { setCardBalance } from "@/lib/actions";
import { buildCardProfiles, byOwesThenName, CARD_NAMES, cardPlanStatus, cardTitle, type PlanStatus } from "@/lib/ledger";
import { dateLong, dateShort, initials, taka, timestampLong } from "@/lib/format";
import type { FinanceData } from "@/lib/types";

/** "Full · by Dec 5" or "EMI 2/6 paid · next ৳5,000 Dec 5", red when late. */
function PlanCell({ status: s, today }: { status: PlanStatus | undefined; today: string }) {
  if (!s || !s.of) return <span className="text-slate-400">—</span>;
  const late = !!s.next && s.next.iso < today;
  const when = s.next ? (
    <span className={late ? "font-medium text-[#9B3426]" : "text-slate-600"}>
      {late ? "Late — " : ""}{s.plan === "emi" ? `next ${taka(s.next.left)} ` : "by "}{dateShort(s.next.iso)}
    </span>
  ) : <span className="text-brand-2">Paid</span>;
  return s.plan === "emi" ? (
    <span className="flex flex-col leading-snug">
      <span className="font-medium text-slate-700">EMI {s.of} × {taka(s.perMonth)} <span className="font-normal text-slate-500">· {s.paidCount}/{s.of} paid</span></span>
      {when}
    </span>
  ) : (
    <span className="flex flex-col leading-snug">
      <span className="font-medium text-slate-700">Full payment</span>
      {when}
    </span>
  );
}

/**
 * One card on its own: limit, available now, what people will give back, and available after.
 * Nothing here touches the bank account or the other card.
 */
export function CardView({ data, slot, today }: { data: FinanceData; slot: 1 | 2; today: string }) {
  const card = data.cards.find((c) => c.slot === slot);
  const viewer = useViewer();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ prefill: string } | null>(null);
  const [editingCard, setEditingCard] = useState(false);
  const [flash, setFlash] = useState({ text: "", at: "" });
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  const profiles = useMemo(
    () => (card ? buildCardProfiles(data, card.id, today).sort(byOwesThenName) : []),
    [data, card, today]
  );
  const uses = useMemo(() => (card ? data.cardUses.filter((u) => u.card_id === card.id) : []), [data.cardUses, card]);
  const peopleById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const nameOf = (id: string | null) => (!id ? "Me" : peopleById.get(id)?.name ?? "Unknown");
  const { sorted: useRows, sort, toggle } = useSort(uses, {
    date: (u) => u.used_on, person: (u) => nameOf(u.person_id), amount: (u) => u.amount,
  });
  const flows = useMemo<Flow[]>(() => card ? [
    ...uses.map((u) => ({ iso: u.used_on, amount: u.amount, dir: "out" as const })),
    ...data.repayments.filter((r) => r.applies_to === "card" && r.card_id === card.id).map((r) => ({ iso: r.paid_on, amount: r.amount, dir: "in" as const })),
  ] : [], [uses, data.repayments, card]);
  const plans = useMemo(() => (card ? cardPlanStatus(data, card.id) : new Map<string, PlanStatus>()), [data, card]);
  usePalettePeople(profiles, setOpenId);

  if (!card) {
    return (
      <Shell subtitle={CARD_NAMES[slot]}>
        <SetupCard slot={slot} />
      </Shell>
    );
  }

  const limit = card.credit_limit;
  // Available = limit − card balance. Each repayment that lowers the card balance frees that much again.
  const availNow = limit != null ? Math.max(limit - card.balance, 0) : null;
  const owing = profiles.filter((p) => p.owes > 0);
  const owed = owing.reduce((s, p) => s + p.owes, 0);
  const availAfter = availNow != null ? Math.min(availNow + owed, limit!) : null;
  let run = availNow ?? 0;
  const owingRows = owing.map((p) => ({ ...p, run: availNow != null ? Math.min((run += p.owes), limit!) : null }));
  const usedTotal = owing.reduce((s, p) => s + p.used, 0);
  const paidTotal = owing.reduce((s, p) => s + p.paid, 0);

  const usedPct = limit ? Math.round(((limit - availNow!) / limit) * 100) : 0;
  // After "Add", highlight the newest row on this card.
  const newestId = flash.at ? [...uses].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id : undefined;
  const pv = openId ? profiles.find((p) => p.id === openId) : undefined;
  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;

  const openAdd = (prefill = "") => setAdding({ prefill });
  const linkBtn = "rounded px-1.5 py-0.5 text-[12.5px] font-medium text-brand-2 underline decoration-good-line underline-offset-2 hover:bg-soft";

  return (
    <Shell
      subtitle={`${card.name}: what you can spend now, what people owe on it, and what frees up once they pay.`}
      actions={
        <HeaderButton onClick={() => openAdd()}>
          <PersonIcon size={15} />
          Add debtor
        </HeaderButton>
      }
    >
      <div className="flex flex-col gap-2.5">
        <Statement label="Available now and after repayment">
          {limit != null ? (
            <BalanceEditor
              label="Available now"
              inputLabel="Available balance now (৳)"
              value={availNow!}
              footnote={`Updated ${timestampLong(card.updated_at)}`}
              onSave={async (n) => {
                if (n > limit) return { error: `Available can't be more than the limit (${taka(limit)}).` };
                return setCardBalance(card.id, limit - n);
              }}
            />
          ) : (
            <Figure label="Available now" value="—" tone="muted" note="Set the credit limit to see this"
              action={!viewer && <button type="button" onClick={() => setEditingCard(true)} className={linkBtn}>Set limit</button>} />
          )}
          <Figure label="+ Owed to you" value={owed} tone="owed" note={`${owing.length} ${owing.length === 1 ? "person" : "people"} on this card`} />
          <Figure label="= Once everyone pays" value={availAfter ?? "—"} tone="good" note="Available balance after repayment" />
        </Statement>
        {limit != null && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5 text-[12.5px] text-slate-500">
            {/* Limit used: what's spent now, plus the slice that frees up once people pay. */}
            <div className="h-2 min-w-[160px] flex-auto overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div className="bar-fill flex h-full">
                <div className="bg-owed-bar transition-[width] duration-700" style={{ width: `${limit ? Math.min((owed / limit) * 100, 100) : 0}%` }} />
                <div className="bg-slate-400 transition-[width] duration-700" style={{ width: `${limit ? Math.max(Math.min(((limit - availNow! - owed) / limit) * 100, 100), 0) : 0}%` }} />
              </div>
            </div>
            <span className="flex flex-wrap items-center gap-1.5">
              Credit limit <span className="money text-slate-700">{taka(limit)}</span>
              <span className="text-slate-400">·</span> {usedPct}% used
              {card.pay_by && <><span className="text-slate-400">·</span> pay by {dateLong(card.pay_by)}</>}
              {!viewer && <button type="button" onClick={() => setEditingCard(true)} className={linkBtn}>Edit</button>}
            </span>
          </div>
        )}
      </div>

      <div className="grid items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <CardVisual card={card} available={availNow} />
          {limit != null && (
            <div className="spot flex items-center gap-4 rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
              <Ring value={usedPct} color={usedPct > 80 ? "var(--color-bad)" : OUT_COLOR}>
                <span>
                  <span className="money block text-[18px] leading-none">{usedPct}%</span>
                  <span className="text-[10.5px] text-slate-500">used</span>
                </span>
              </Ring>
              <dl className="m-0 grid flex-auto grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
                <div><dt className="text-slate-500">Limit</dt><dd className="money m-0 text-[14px]">{taka(limit)}</dd></div>
                <div><dt className="text-slate-500">Spent</dt><dd className="money m-0 text-[14px]">{taka(limit - availNow!)}</dd></div>
                <div><dt className="text-slate-500">Others owe</dt><dd className="money m-0 text-[14px] text-owed">{taka(owed)}</dd></div>
                <div><dt className="text-slate-500">Pay by</dt><dd className="m-0 text-[14px] font-medium">{card.pay_by ? dateLong(card.pay_by) : "—"}</dd></div>
              </dl>
            </div>
          )}
        </div>
        <FlowChart title="Card activity" sub="Spent on this card and paid back by people, per month."
          flows={flows} today={today} outLabel="Spent" inLabel="Paid back" />
      </div>

      <Flash text={flash.text} />

      <ProfileSlider
        title="People"
        sub={`Everyone who has used your ${CARD_NAMES[slot]}.`}
        tookLabel="Used"
        items={profiles.map((p) => ({ ...p, took: p.used }))}
        onOpen={setOpenId}
        onAdd={() => openAdd()}
      />

      <SectionCard>
        <SectionHead id="owe-h" title="Repayment outlook"
          sub={`What each person still owes, biggest first, and your available balance as each one pays. Tap a name to ${viewer ? "open their profile" : "record a repayment"}.`} />
        <div className="overflow-x-auto">
          <table className="stack-table w-full min-w-[820px] border-collapse text-[14px]">
            <thead>
              <tr className={theadRow}>
                <th scope="col" className={th}>Person</th>
                <th scope="col" className={`${th} text-right`}>Used</th>
                <th scope="col" className={`${th} text-right`}>Paid back</th>
                <th scope="col" className={`${th} text-right`}>Still owes</th>
                <th scope="col" className={th}>Due</th>
                <th scope="col" className={`${th} text-right`}>Available after</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-soft">
                <th scope="row" className={`${td} text-left font-medium text-slate-500`}>Today</th>
                <td className={`${td} stack-hide text-right text-slate-400`}>—</td>
                <td className={`${td} stack-hide text-right text-slate-400`}>—</td>
                <td className={`${td} stack-hide text-right text-slate-400`}>—</td>
                <td className={`${td} stack-hide text-slate-400`}>—</td>
                <td data-label="Available" className={`${td} money text-right`}>{availNow != null ? taka(availNow) : "—"}</td>
              </tr>
              {owingRows.map((p) => (
                <tr key={p.id} className="border-b border-soft">
                  <th scope="row" className="px-4 py-1.5 text-left">
                    <PersonButton name={p.name} initials={p.initials} size={30} onClick={() => setOpenId(p.id)} />
                  </th>
                  <td data-label="Used" className={`${td} text-right font-mono text-slate-600`}>{taka(p.used)}</td>
                  <td data-label="Paid back" className={`${td} text-right font-mono text-brand-2`}>{p.paid ? taka(p.paid) : "—"}</td>
                  <td data-label="Still owes" className={`${td} money text-right text-owed`}>{taka(p.owes)}</td>
                  <td data-label="Due" className={td}><DuePill kind={p.dueKind}>{p.dueShort}</DuePill></td>
                  <td data-label="Available after" className={`${td} money text-right`}>{p.run != null ? taka(p.run) : "—"}</td>
                </tr>
              ))}
              <tr className={totalRow}>
                <th scope="row" className={`${td} text-left`}>Once everyone pays</th>
                <td data-label="Used" className={`${td} money text-right`}>{taka(usedTotal)}</td>
                <td data-label="Paid back" className={`${td} money text-right`}>{taka(paidTotal)}</td>
                <td data-label="Still owes" className={`${td} money text-right text-owed`}>{taka(owed)}</td>
                <td className={td} />
                <td data-label="Available after" className={`${td} money text-right text-brand-2`}>{availAfter != null ? taka(availAfter) : "Set limit"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHead id="log-h" title="Transactions" sub="Every use of this card. Tap a name to open their profile, or a heading to sort." />
        <div className="overflow-x-auto">
          <table className="stack-table w-full min-w-[820px] border-collapse text-[14px]">
            <thead>
              <tr className={theadRow}>
                <SortTh k="date" label="Date" sort={sort} onSort={toggle} />
                <SortTh k="person" label="Person" sort={sort} onSort={toggle} text />
                <th scope="col" className={th}>Why / where</th>
                <SortTh k="amount" label="Amount" sort={sort} onSort={toggle} right />
                <th scope="col" className={th}>Pay back</th>
                <th scope="col" className={th}><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody>
              {useRows.map((u) => {
                const me = !u.person_id;
                const name = nameOf(u.person_id);
                const isNew = u.id === newestId;
                return (
                  <tr key={u.id} className={`border-b border-soft ${isNew ? "animate-highlight bg-good-tint" : ""}`}>
                    <td data-label="Date" className={`${td} whitespace-nowrap text-slate-600`}>{dateLong(u.used_on)}</td>
                    <th scope="row" className="px-4 py-1.5 text-left">
                      {me ? (
                        <span className="inline-flex min-h-10 items-center text-slate-500">Me</span>
                      ) : (
                        <PersonButton name={name} initials={initials(name)} onClick={() => setOpenId(u.person_id!)} />
                      )}
                    </th>
                    <td data-label="Why / where" className={td}>{u.reason_or_place}</td>
                    <td data-label="Amount" className={`${td} money text-right ${me ? "text-slate-500" : ""}`}>{taka(u.amount)}</td>
                    <td data-label="Pay back" className={`${td} text-[13px]`}><PlanCell status={plans.get(u.id)} today={today} /></td>
                    <td className="stack-corner px-2 text-right">
                      <DeleteButton label={`Delete ${name}'s card use, ${taka(u.amount)}`} onClick={() => setDeleting({
                        kind: "card_use", id: u.id, amount: u.amount, iso: u.used_on,
                        what: `${me ? "My spending" : `${name} used the card`} — ${u.reason_or_place}`,
                        undo: undoText("card_use", u.amount, CARD_NAMES[slot]),
                      })} />
                    </td>
                  </tr>
                );
              })}
              {uses.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Nothing recorded on this card yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {adding && (
        <AddDebtorDialog
          mode="card"
          card={card}
          title={`Add debtor — ${cardTitle(card)}`}
          knownNames={data.people.map((p) => p.name)}
          prefillName={adding.prefill}
          onClose={() => setAdding(null)}
          onAdded={(personId, text) => {
            setAdding(null);
            setFlash({ text, at: "added" });
            if (personId) setOpenId(personId);
          }}
        />
      )}

      {pv && (
        <ProfileModal
          profile={pv}
          variant="card"
          card={card}
          cards={data.cards}
          account={account}
          onClose={() => setOpenId(null)}
          onMore={() => { setOpenId(null); openAdd(pv.name); }}
          onSaved={(text) => setFlash({ text, at: "" })}
        />
      )}

      {editingCard && <EditCardDialog card={card} onClose={() => setEditingCard(false)} />}

      {deleting && (
        <DeleteRecordDialog target={deleting} onClose={() => setDeleting(null)}
          onDone={(text) => { setDeleting(null); setFlash({ text, at: "" }); }} />
      )}
    </Shell>
  );
}
