"use client";

import { useMemo, useState } from "react";
import { Shell, HeaderButton } from "@/components/shell";
import { BankIcon, PersonIcon } from "@/components/icons";
import { BalanceEditor, EqSign } from "@/components/balance-editor";
import { ProfileSlider } from "@/components/debtors/profile-slider";
import { ProfileModal } from "@/components/debtors/profile-modal";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { DuePill, Flash, PersonButton, SectionCard, SectionHead, td, th, theadRow } from "@/components/debtors/bits";
import { SetupAccount } from "@/components/setup-forms";
import { DeleteButton, DeleteRecordDialog, undoText, type DeleteTarget } from "@/components/delete-record-dialog";
import { setAccountBalance } from "@/lib/actions";
import { buildLoanProfiles, byOwesThenName } from "@/lib/ledger";
import { dateLong, initials, pct, taka, timestampLong } from "@/lib/format";
import type { FinanceData } from "@/lib/types";

export function AccountView({ data, today }: { data: FinanceData; today: string }) {
  const account = data.accounts[0];
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ prefill: string } | null>(null);
  const [flash, setFlash] = useState({ text: "", personId: "" });
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  // Loans only: credit-card use and its repayments live on the card pages, not in the bank balance.
  const profiles = useMemo(() => buildLoanProfiles(data, today).sort(byOwesThenName), [data, today]);

  if (!account) {
    return (
      <Shell icon={<BankIcon />} subtitle="Bank account">
        <SetupAccount />
      </Shell>
    );
  }

  const acct = { id: account.id, name: account.name };
  const now = account.balance;
  const owing = profiles.filter((p) => p.owes > 0);
  let run = now;
  const owingRows = owing.map((p) => ({ ...p, run: (run += p.owes) }));
  const owed = owing.reduce((s, p) => s + p.owes, 0);
  const lentTotal = owing.reduce((s, p) => s + p.used, 0);
  const paidTotal = owing.reduce((s, p) => s + p.paid, 0);
  const after = now + owed;
  const inHand = after ? pct(now, after, 1) : 100;
  const outPct = Math.round((100 - inHand) * 10) / 10;

  const peopleById = new Map(data.people.map((p) => [p.id, p]));
  const loans = data.loans.filter((l) => l.account_id === account.id || l.account_id === null);
  const newestForFlash = flash.personId
    ? loans.filter((l) => l.person_id === flash.personId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id
    : undefined;

  const pv = openId ? profiles.find((p) => p.id === openId) : undefined;
  const open = (id: string) => setOpenId(id);

  return (
    <Shell
      icon={<BankIcon />}
      subtitle={`${account.name} — money there now, who took money from it, debtor profiles, and the balance once everyone pays back`}
      actions={
        <HeaderButton onClick={() => setAdding({ prefill: "" })}>
          <PersonIcon size={16} />
          Add Debtor
        </HeaderButton>
      }
    >
      <section aria-label="Balance now and after repayment" className="flex flex-wrap items-stretch gap-3.5">
        <BalanceEditor
          tone="bank"
          label={`${account.name} — money now`}
          inputLabel={`New ${account.name} balance (৳)`}
          value={now}
          footnote={`Updated ${timestampLong(account.updated_at)}`}
          onSave={(n) => setAccountBalance(account.id, n)}
        />
        <EqSign>+</EqSign>
        <div className="flex flex-[1_1_280px] flex-col gap-2.5 rounded-2xl border border-[#FDE68A] border-b-4 border-b-[#F59E0B] bg-[#FFFBEB] p-[22px]">
          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-700">People owe you</div>
          <div className="money text-[clamp(28px,3.4vw,38px)] text-[#92400E]">{taka(owed)}</div>
          <div className="text-sm text-[#92400E]">{owing.length} people still owe on loans from this account</div>
        </div>
        <EqSign>=</EqSign>
        <div className="flex flex-[1_1_300px] flex-col gap-2.5 rounded-2xl bg-brand p-[22px] text-white">
          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint">After everyone pays you back</div>
          <div className="money text-[clamp(28px,3.4vw,38px)]">{taka(after)}</div>
          <div className="text-sm text-mint">Your {account.name} balance once all money comes back</div>
        </div>
      </section>

      <section aria-label="Progress" className="flex flex-col gap-2.5 rounded-2xl border border-line bg-white px-5 py-[18px]">
        <div className="flex flex-wrap justify-between gap-2 text-[14.5px]">
          <span><strong>{inHand}%</strong> of your money is in the bank now</span>
          <span className="text-[#92400E]"><strong>{outPct}%</strong> is still with other people</span>
        </div>
        <div className="flex h-3.5 overflow-hidden rounded-[7px] bg-soft">
          <div className="bg-[#10B981]" style={{ width: `${inHand}%` }} />
          <div className="bg-[#F59E0B]" style={{ width: `${outPct}%` }} />
        </div>
      </section>

      <Flash text={flash.text} />

      <ProfileSlider
        title="Debtor profiles"
        sub="Everyone who has taken money from you. Open a profile to see their full history."
        items={profiles.map((p) => ({ ...p, took: p.used }))}
        onOpen={open}
        onAdd={() => setAdding({ prefill: "" })}
      />

      <SectionCard>
        <SectionHead id="deb-h" title="Debtors from this account"
          sub={`Who took money from ${account.name}, when, why, how, and when they will pay it back. Tap a name to open their profile.`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[14.5px]">
            <thead>
              <tr className={theadRow}>
                <th scope="col" className={th}>Date taken</th>
                <th scope="col" className={th}>Person</th>
                <th scope="col" className={th}>Why</th>
                <th scope="col" className={th}>How</th>
                <th scope="col" className={`${th} text-right`}>Amount</th>
                <th scope="col" className={th}>Pay back by</th>
                <th scope="col" className={th}><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => {
                const name = peopleById.get(l.person_id)?.name ?? "Unknown";
                const isNew = l.id === newestForFlash;
                return (
                  <tr key={l.id} className={`border-b border-soft ${isNew ? "bg-[#F0FDF4]" : ""}`}>
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{dateLong(l.taken_on)}</td>
                    <th scope="row" className="px-4 py-1.5 text-left">
                      <PersonButton name={name} initials={initials(name)} onClick={() => open(l.person_id)} />
                      {isNew && <> <span className="rounded-md bg-[#D1FAE5] px-[7px] py-px text-xs font-semibold text-[#065F46]">New</span></>}
                    </th>
                    <td className={td}><span className="rounded-md bg-soft px-2 py-0.5 text-[13px]">#{l.reason}</span></td>
                    <td className={`${td} text-slate-600`}>{l.method}</td>
                    <td className={`${td} money text-right text-[#B45309]`}>− {taka(l.amount)}</td>
                    <td className={`${td} whitespace-nowrap`}>{dateLong(l.due_on)}</td>
                    <td className="px-2 text-right">
                      <DeleteButton label={`Delete loan to ${name}, ${taka(l.amount)}`} onClick={() => setDeleting({
                        kind: "loan", id: l.id, amount: l.amount, iso: l.taken_on, what: `Loan to ${name} — ${l.reason}`,
                        undo: l.account_id ? undoText("loan", l.amount, account.name) : null,
                      })} />
                    </td>
                  </tr>
                );
              })}
              {loans.length === 0 && (
                <tr><td colSpan={7}className="px-4 py-6 text-center text-slate-500">No loans from this account yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHead id="owe-h" title="Who will bring money back"
          sub={`Each person's amount still owed, and what your ${account.name} balance becomes as each one pays — biggest first`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[14.5px]">
            <thead>
              <tr className={theadRow}>
                <th scope="col" className={th}>Person</th>
                <th scope="col" className={`${th} text-right`}>Took</th>
                <th scope="col" className={`${th} text-right`}>Paid back</th>
                <th scope="col" className={`${th} bg-[#FEFCE8] text-right text-[#92400E]`}>Will give back</th>
                <th scope="col" className={th}>Due</th>
                <th scope="col" className={`${th} text-right`}>Bank balance after</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-soft bg-[#F0FDF4]">
                <th scope="row" className={`${td} text-left font-semibold text-[#047857]`}>Now</th>
                <td className={`${td} text-right`}>—</td>
                <td className={`${td} text-right`}>—</td>
                <td className={`${td} bg-[#FEFCE8] text-right`}>—</td>
                <td className={td}>Today</td>
                <td className={`${td} money text-right`}>{taka(now)}</td>
              </tr>
              {owingRows.map((p) => (
                <tr key={p.id} className="border-b border-soft">
                  <th scope="row" className="px-4 py-1.5 text-left">
                    <PersonButton name={p.name} initials={p.initials} size={30} onClick={() => open(p.id)} />
                  </th>
                  <td className={`${td} text-right font-mono text-slate-600`}>{taka(p.used)}</td>
                  <td className={`${td} text-right font-mono text-brand-2`}>{p.paid ? taka(p.paid) : "—"}</td>
                  <td className={`${td} money bg-[#FEFCE8] text-right text-[#78350F]`}>+ {taka(p.owes)}</td>
                  <td className={td}><DuePill kind={p.dueKind}>{p.dueShort}</DuePill></td>
                  <td className={`${td} money text-right text-brand-2`}>{taka(p.run)}</td>
                </tr>
              ))}
              <tr className="bg-brand text-white">
                <th scope="row" className="px-4 py-3.5 text-left font-bold">AFTER EVERYONE PAYS</th>
                <td className="px-4 py-3.5 text-right font-mono">{taka(lentTotal)}</td>
                <td className="px-4 py-3.5 text-right font-mono">{taka(paidTotal)}</td>
                <td className="money px-4 py-3.5 text-right">+ {taka(owed)}</td>
                <td className="px-4 py-3.5">—</td>
                <td className="money px-4 py-3.5 text-right text-base">{taka(after)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      {adding && (
        <AddDebtorDialog
          mode="loan"
          title={`Add debtor — ${account.name}`}
          account={acct}
          knownNames={data.people.map((p) => p.name)}
          prefillName={adding.prefill}
          onClose={() => setAdding(null)}
          onAdded={(personId, text) => {
            setAdding(null);
            setFlash({ text, personId: personId ?? "" });
            if (personId) setOpenId(personId);
          }}
        />
      )}

      {pv && (
        <ProfileModal
          profile={pv}
          variant="bank"
          cards={data.cards}
          account={acct}
          onClose={() => setOpenId(null)}
          onMore={() => { setOpenId(null); setAdding({ prefill: pv.name }); }}
          onSaved={(text) => setFlash({ text, personId: "" })}
        />
      )}

      {deleting && (
        <DeleteRecordDialog target={deleting} onClose={() => setDeleting(null)}
          onDone={(text) => { setDeleting(null); setFlash({ text, personId: "" }); }} />
      )}
    </Shell>
  );
}
