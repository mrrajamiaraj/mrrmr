"use client";

import { useMemo, useState } from "react";
import { Shell, HeaderButton } from "@/components/shell";
import { CardIcon, ChipIcon, PencilIcon, PersonIcon } from "@/components/icons";
import { BalanceEditor, EqSign } from "@/components/balance-editor";
import { ProfileSlider } from "@/components/debtors/profile-slider";
import { ProfileModal } from "@/components/debtors/profile-modal";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { DuePill, Flash, PersonButton, SectionCard, SectionHead, td, th, theadRow } from "@/components/debtors/bits";
import { EditCardDialog, SetupCard } from "@/components/setup-forms";
import { setCardBalance } from "@/lib/actions";
import { buildCardProfiles, byOwesThenName, cardTitle } from "@/lib/ledger";
import { dateLong, dateShort, daysBetween, initials, taka, timestampLong } from "@/lib/format";
import type { FinanceData } from "@/lib/types";

const LOOK: Record<1 | 2, { bg: string; line: string }> = {
  1: { bg: "#134E4A", line: "#14B8A6" },
  2: { bg: "#0F172A", line: "#6366F1" },
};

export function CardView({ data, slot, today }: { data: FinanceData; slot: 1 | 2; today: string }) {
  const card = data.cards.find((c) => c.slot === slot);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ prefill: string } | null>(null);
  const [editingCard, setEditingCard] = useState(false);
  const [flash, setFlash] = useState({ text: "", at: "" });

  const profiles = useMemo(
    () => (card ? buildCardProfiles(data, card.id, today).sort(byOwesThenName) : []),
    [data, card, today]
  );

  if (!card) {
    return (
      <Shell icon={<CardIcon />} subtitle={`Credit Card ${slot}`}>
        <SetupCard slot={slot} />
      </Shell>
    );
  }

  const look = LOOK[slot];
  const title = `Credit Card ${slot} — ${cardTitle(card)}`;
  const bal = card.balance;
  const owing = profiles.filter((p) => p.owes > 0);
  let run = bal;
  const owingRows = owing.map((p) => ({ ...p, run: Math.max((run -= p.owes), 0) }));
  const owed = owing.reduce((s, p) => s + p.owes, 0);
  const othersUsed = profiles.reduce((s, p) => s + p.used, 0);
  const othersPaid = profiles.reduce((s, p) => s + p.paid, 0);
  const share = Math.max(bal - owed, 0);
  const othersPct = bal ? Math.min(100, Math.round((owed / bal) * 1000) / 10) : 0;
  const ownPct = Math.round((100 - othersPct) * 10) / 10;
  const limit = card.credit_limit;
  const util = limit ? Math.round((bal / limit) * 1000) / 10 : null;
  const daysLeft = card.pay_by ? daysBetween(today, card.pay_by) : null;
  const holder = (data.accounts[0]?.holder_name ?? "Card holder").toUpperCase();

  const peopleById = new Map(data.people.map((p) => [p.id, p]));
  const uses = data.cardUses.filter((u) => u.card_id === card.id);
  // After "Add", highlight the newest row on this card.
  const newestId = flash.at ? [...uses].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id : undefined;
  const pv = openId ? profiles.find((p) => p.id === openId) : undefined;
  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;

  const stats = [
    { label: "Credit limit", value: limit != null ? taka(limit) : "Not set", color: "#0F172A" },
    { label: "Available", value: limit != null ? taka(Math.max(limit - bal, 0)) : "—", color: "#0F766E" },
    { label: "Minimum due", value: taka(Math.round(bal * 0.05)), color: "#0F172A" },
    {
      label: "Pay by",
      value: card.pay_by ? `${dateShort(card.pay_by)} · ${daysLeft! < 0 ? `${-daysLeft!}d late` : `${daysLeft}d`}` : "Not set",
      color: "#9F1239",
    },
  ];

  const openAdd = (prefill = "") => setAdding({ prefill });

  return (
    <Shell
      icon={<CardIcon />}
      subtitle={`${title} — balance, who used it, debtor profiles & your own share after everyone pays back`}
      actions={
        <HeaderButton onClick={() => openAdd()}>
          <PersonIcon size={16} />
          Add Debtor
        </HeaderButton>
      }
    >
      <section aria-label="Card balance and your own share" className="flex flex-wrap items-stretch gap-3.5">
        <BalanceEditor
          tone="card"
          label="Card balance now"
          inputLabel="New card balance (৳)"
          value={bal}
          footnote={`What you owe the bank · updated ${timestampLong(card.updated_at)}`}
          onSave={(n) => setCardBalance(card.id, n)}
        />
        <EqSign>−</EqSign>
        <div className="flex flex-[1_1_280px] flex-col gap-2.5 rounded-2xl border border-[#FDE68A] border-b-4 border-b-[#F59E0B] bg-[#FFFBEB] p-[22px]">
          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-700">People owe you for this card</div>
          <div className="money text-[clamp(28px,3.4vw,38px)] text-[#92400E]">{taka(owed)}</div>
          <div className="text-sm text-[#92400E]">{owing.length} people used this card and still owe</div>
        </div>
        <EqSign>=</EqSign>
        <div className="flex flex-[1_1_300px] flex-col gap-2.5 rounded-2xl bg-brand p-[22px] text-white">
          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint">Your own share after everyone pays</div>
          <div className="money text-[clamp(28px,3.4vw,38px)]">{taka(share)}</div>
          <div className="text-sm text-mint">What you pay from your own pocket for this bill</div>
        </div>
      </section>

      <section aria-label={title} className="flex flex-wrap items-stretch gap-5 rounded-2xl border border-line border-t-4 bg-white p-[18px]" style={{ borderTopColor: look.line }}>
        <div className="box-border flex min-h-[200px] max-w-[400px] flex-[1_1_300px] flex-col justify-between gap-[18px] rounded-2xl p-[22px] text-white" style={{ background: look.bg }}>
          <div className="flex items-center justify-between"><span className="text-base font-semibold">{card.bank}</span><span className="text-[13px] text-slate-300">{card.network ?? card.name}</span></div>
          <ChipIcon />
          <div className="font-mono text-lg tracking-[0.12em]">•••• •••• •••• {card.last4 ?? "••••"}</div>
          <div className="flex items-end justify-between gap-2.5">
            <div><div className="text-xs text-slate-300">Card holder</div><div className="font-semibold tracking-[0.04em]">{holder}</div></div>
            <div className="text-right"><div className="text-xs text-slate-300">Balance</div><div className="money text-lg">{taka(bal)}</div></div>
          </div>
        </div>
        <div className="flex min-w-0 flex-[999_1_380px] flex-col justify-center gap-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-soft bg-[#F8FAFC] p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">{s.label}</div>
                <div className="money text-base" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span><strong>{ownPct}%</strong> of this bill is your own spending</span>
              <span className="text-[#92400E]"><strong>{othersPct}%</strong> is other people&apos;s — they owe you</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-md bg-soft">
              <div className="bg-slate-700" style={{ width: `${ownPct}%` }} />
              <div className="bg-[#F59E0B]" style={{ width: `${othersPct}%` }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-slate-500">
              <span>{util != null ? `Limit used: ${util}% of ${taka(limit!)}` : "No credit limit saved"}</span>
              <button type="button" onClick={() => setEditingCard(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 font-semibold text-slate-700">
                <PencilIcon size={14} />
                Limit &amp; pay-by date
              </button>
            </div>
          </div>
        </div>
      </section>

      <Flash text={flash.text} />

      <ProfileSlider
        title="Debtor profiles — this card"
        sub="Everyone who used this card. Open a profile to see their full history."
        tookLabel="USED"
        items={profiles.map((p) => ({ ...p, took: p.used }))}
        onOpen={setOpenId}
        onAdd={() => openAdd()}
      />

      <SectionCard>
        <SectionHead id="log-h" title="Who used this card"
          sub="Every transaction — who, when, why or where, and when they will pay it back. Tap a name to open their profile." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[14.5px]">
            <thead>
              <tr className={theadRow}>
                <th scope="col" className={th}>Date used</th>
                <th scope="col" className={th}>Person</th>
                <th scope="col" className={th}>Why / where</th>
                <th scope="col" className={th}>Category</th>
                <th scope="col" className={`${th} text-right`}>Amount</th>
                <th scope="col" className={th}>Pay back by</th>
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
                        <span className="inline-flex min-h-11 items-center gap-2.5 font-semibold text-slate-600">
                          <span className="inline-flex size-7 items-center justify-center rounded-full bg-[#E2E8F0] text-[11px] font-bold text-slate-800">ME</span>
                          Me (my spending)
                        </span>
                      ) : (
                        <PersonButton name={name} initials={initials(name)} onClick={() => setOpenId(u.person_id!)} />
                      )}
                      {isNew && <> <span className="rounded-md bg-[#D1FAE5] px-[7px] py-px text-xs font-semibold text-[#065F46]">New</span></>}
                    </th>
                    <td className={`${td} font-medium`}>{u.reason_or_place}</td>
                    <td className={td}><span className="rounded-md bg-soft px-2 py-0.5 text-[13px]">#{u.category}</span></td>
                    <td className={`${td} money text-right`} style={{ color: me ? "#334155" : "#B45309" }}>{taka(u.amount)}</td>
                    <td className={`${td} whitespace-nowrap`}>{me ? "—" : dateLong(u.due_on, "—")}</td>
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

      <SectionCard>
        <SectionHead id="owe-h" title="Who will bring money back"
          sub="What each person still owes for this card, and how your own share of the bill shrinks as each one pays — biggest first" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[14.5px]">
            <thead>
              <tr className={theadRow}>
                <th scope="col" className={th}>Person</th>
                <th scope="col" className={`${th} text-right`}>Used this card</th>
                <th scope="col" className={`${th} text-right`}>Paid back</th>
                <th scope="col" className={`${th} bg-[#FEFCE8] text-right text-[#92400E]`}>Will give back</th>
                <th scope="col" className={th}>Due</th>
                <th scope="col" className={`${th} text-right`}>Your share after</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-soft bg-[#FFF5F6]">
                <th scope="row" className={`${td} text-left font-semibold text-[#BE123C]`}>Card balance now</th>
                <td className={`${td} text-right`}>—</td>
                <td className={`${td} text-right`}>—</td>
                <td className={`${td} bg-[#FEFCE8] text-right`}>—</td>
                <td className={td}>Today</td>
                <td className={`${td} money text-right`}>{taka(bal)}</td>
              </tr>
              {owingRows.map((p) => (
                <tr key={p.id} className="border-b border-soft">
                  <th scope="row" className="px-4 py-1.5 text-left">
                    <PersonButton name={p.name} initials={p.initials} size={30} onClick={() => setOpenId(p.id)} />
                  </th>
                  <td className={`${td} text-right font-mono text-slate-600`}>{taka(p.used)}</td>
                  <td className={`${td} text-right font-mono text-brand-2`}>{taka(p.paid)}</td>
                  <td className={`${td} money bg-[#FEFCE8] text-right text-[#78350F]`}>− {taka(p.owes)}</td>
                  <td className={td}><DuePill kind={p.dueKind}>{p.dueShort}</DuePill></td>
                  <td className={`${td} money text-right text-brand-2`}>{taka(p.run)}</td>
                </tr>
              ))}
              <tr className="bg-brand text-white">
                <th scope="row" className="px-4 py-3.5 text-left font-bold">AFTER EVERYONE PAYS</th>
                <td className="px-4 py-3.5 text-right font-mono">{taka(othersUsed)}</td>
                <td className="px-4 py-3.5 text-right font-mono">{taka(othersPaid)}</td>
                <td className="money px-4 py-3.5 text-right">− {taka(owed)}</td>
                <td className="px-4 py-3.5">—</td>
                <td className="money px-4 py-3.5 text-right text-base">{taka(share)}</td>
              </tr>
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
    </Shell>
  );
}
