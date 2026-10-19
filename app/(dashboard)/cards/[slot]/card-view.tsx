"use client";

import { useMemo, useState } from "react";
import { Shell, HeaderButton, useViewer } from "@/components/shell";
import { CardIcon, PencilIcon, PersonIcon } from "@/components/icons";
import { BalanceEditor, EqSign } from "@/components/balance-editor";
import { ProfileSlider } from "@/components/debtors/profile-slider";
import { ProfileModal } from "@/components/debtors/profile-modal";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { DuePill, Flash, PersonButton, SectionCard, SectionHead, td, th, theadRow } from "@/components/debtors/bits";
import { EditCardDialog, SetupCard } from "@/components/setup-forms";
import { DeleteButton, DeleteRecordDialog, undoText, type DeleteTarget } from "@/components/delete-record-dialog";
import { setCardBalance } from "@/lib/actions";
import { buildCardProfiles, byOwesThenName, CARD_NAMES, cardTitle } from "@/lib/ledger";
import { dateLong, initials, taka, timestampLong } from "@/lib/format";
import type { FinanceData } from "@/lib/types";

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

  if (!card) {
    return (
      <Shell icon={<CardIcon />} subtitle={CARD_NAMES[slot]}>
        <SetupCard slot={slot} />
      </Shell>
    );
  }

  const title = `${CARD_NAMES[slot]} — ${card.name}`;
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

  const peopleById = new Map(data.people.map((p) => [p.id, p]));
  const uses = data.cardUses.filter((u) => u.card_id === card.id);
  // After "Add", highlight the newest row on this card.
  const newestId = flash.at ? [...uses].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id : undefined;
  const pv = openId ? profiles.find((p) => p.id === openId) : undefined;
  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;

  const openAdd = (prefill = "") => setAdding({ prefill });
  const big = "money text-[clamp(28px,3.4vw,38px)]";
  const label = "text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-700";

  return (
    <Shell
      icon={<CardIcon />}
      subtitle={`${title} — limit, available now, money people will give back, and available after`}
      actions={
        <HeaderButton onClick={() => openAdd()}>
          <PersonIcon size={16} />
          Add Debtor
        </HeaderButton>
      }
    >
      <section aria-label="Available now and after repayment" className="flex flex-wrap items-stretch gap-3.5">
        {limit != null ? (
          <BalanceEditor
            tone="bank"
            label={`${CARD_NAMES[slot]} — available now`}
            inputLabel="Available balance now (৳)"
            value={availNow!}
            footnote={`Updated ${timestampLong(card.updated_at)}`}
            onSave={async (n) => {
              if (n > limit) return { error: `Available can't be more than the limit (${taka(limit)}).` };
              return setCardBalance(card.id, limit - n);
            }}
          />
        ) : (
          <div className="flex flex-[1_1_280px] flex-col gap-2.5 rounded-2xl border border-line bg-white p-[22px]">
            <span className={label}>{CARD_NAMES[slot]} — available now</span>
            <div className={`${big} text-slate-400`}>—</div>
            {!viewer && <button type="button" onClick={() => setEditingCard(true)} className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-slate-700">
              <PencilIcon size={14} />
              Set credit limit first
            </button>}
          </div>
        )}
        <EqSign>+</EqSign>
        <div className="flex flex-[1_1_280px] flex-col gap-2.5 rounded-2xl border border-[#FDE68A] border-b-4 border-b-[#F59E0B] bg-[#FFFBEB] p-[22px]">
          <span className={label}>People owe you</span>
          <div className={`${big} text-[#92400E]`}>{taka(owed)}</div>
          <div className="text-sm text-[#92400E]">{owing.length} people still owe on this card</div>
        </div>
        <EqSign>=</EqSign>
        <div className="flex flex-[1_1_300px] flex-col gap-2.5 rounded-2xl bg-brand p-[22px] text-white">
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint">After everyone pays you back</span>
          <div className={big}>{availAfter != null ? taka(availAfter) : "—"}</div>
          <div className="text-sm text-mint">Your available balance once all money comes back</div>
        </div>
      </section>

      {limit != null && (
        <div className="flex flex-wrap items-center gap-2.5 text-sm text-slate-600">
          Credit limit: <span className="money text-slate-800">{taka(limit)}</span>
          {!viewer && <button type="button" onClick={() => setEditingCard(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 font-semibold text-slate-700">
            <PencilIcon size={14} />
            Change
          </button>}
        </div>
      )}

      <Flash text={flash.text} />

      <ProfileSlider
        title="Debtor profiles"
        sub={`Everyone who has used your ${CARD_NAMES[slot]}. Open a profile to see their full history.`}
        tookLabel="USED"
        items={profiles.map((p) => ({ ...p, took: p.used }))}
        onOpen={setOpenId}
        onAdd={() => openAdd()}
      />

      <SectionCard>
        <SectionHead id="owe-h" title="Who will bring money back"
          sub={`Each person's amount still owed, and what your available balance becomes as each one pays — biggest first. Tap a name to ${viewer ? "open their profile" : "record a repayment"}.`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[14.5px]">
            <thead>
              <tr className={theadRow}>
                <th scope="col" className={th}>Person</th>
                <th scope="col" className={`${th} text-right`}>Used</th>
                <th scope="col" className={`${th} text-right`}>Paid back</th>
                <th scope="col" className={`${th} bg-[#FEFCE8] text-right text-[#92400E]`}>Will give back</th>
                <th scope="col" className={th}>Due</th>
                <th scope="col" className={`${th} text-right`}>Available after</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-soft bg-[#F0FDF4]">
                <th scope="row" className={`${td} text-left font-semibold text-[#047857]`}>Now</th>
                <td className={`${td} text-right`}>—</td>
                <td className={`${td} text-right`}>—</td>
                <td className={`${td} bg-[#FEFCE8] text-right`}>—</td>
                <td className={td}>Today</td>
                <td className={`${td} money text-right`}>{availNow != null ? taka(availNow) : "—"}</td>
              </tr>
              {owingRows.map((p) => (
                <tr key={p.id} className="border-b border-soft">
                  <th scope="row" className="px-4 py-1.5 text-left">
                    <PersonButton name={p.name} initials={p.initials} size={30} onClick={() => setOpenId(p.id)} />
                  </th>
                  <td className={`${td} text-right font-mono text-slate-600`}>{taka(p.used)}</td>
                  <td className={`${td} text-right font-mono text-brand-2`}>{p.paid ? taka(p.paid) : "—"}</td>
                  <td className={`${td} money bg-[#FEFCE8] text-right text-[#78350F]`}>+ {taka(p.owes)}</td>
                  <td className={td}><DuePill kind={p.dueKind}>{p.dueShort}</DuePill></td>
                  <td className={`${td} money text-right text-brand-2`}>{p.run != null ? taka(p.run) : "—"}</td>
                </tr>
              ))}
              <tr className="bg-brand text-white">
                <th scope="row" className="px-4 py-3.5 text-left font-bold">AFTER EVERYONE PAYS</th>
                <td className="px-4 py-3.5 text-right font-mono">{taka(usedTotal)}</td>
                <td className="px-4 py-3.5 text-right font-mono">{taka(paidTotal)}</td>
                <td className="money px-4 py-3.5 text-right">+ {taka(owed)}</td>
                <td className="px-4 py-3.5">—</td>
                <td className="money px-4 py-3.5 text-right text-base">{availAfter != null ? taka(availAfter) : "Set limit"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHead id="log-h" title="Card transactions" sub="Every use of this card. Tap a name to open their profile." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[14.5px]">
            <thead>
              <tr className={theadRow}>
                <th scope="col" className={th}>Date</th>
                <th scope="col" className={th}>Person</th>
                <th scope="col" className={th}>Why / where</th>
                <th scope="col" className={`${th} text-right`}>Amount</th>
                <th scope="col" className={th}><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody>
              {uses.map((u) => {
                const me = !u.person_id;
                const name = me ? "Me" : peopleById.get(u.person_id!)?.name ?? "Unknown";
                const isNew = u.id === newestId;
                return (
                  <tr key={u.id} className={`border-b border-soft ${isNew ? "bg-[#F0FDF4]" : ""}`}>
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{dateLong(u.used_on)}</td>
                    <th scope="row" className="px-4 py-1.5 text-left">
                      {me ? (
                        <span className="inline-flex min-h-11 items-center font-semibold text-slate-600">Me</span>
                      ) : (
                        <PersonButton name={name} initials={initials(name)} onClick={() => setOpenId(u.person_id!)} />
                      )}
                    </th>
                    <td className={`${td} font-medium`}>{u.reason_or_place}</td>
                    <td className={`${td} money text-right`} style={{ color: me ? "#334155" : "#B45309" }}>{taka(u.amount)}</td>
                    <td className="px-2 text-right">
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
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Nothing recorded on this card yet.</td></tr>
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
