"use client";

import { useMemo, useState } from "react";
import { Shell, HeaderButton } from "@/components/shell";
import { PersonIcon } from "@/components/icons";
import { BalanceEditor, Figure, Statement } from "@/components/balance-editor";
import { ProfileSlider } from "@/components/debtors/profile-slider";
import { ProfileModal } from "@/components/debtors/profile-modal";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { DuePill, Flash, PersonButton, SectionCard, SectionHead, td, th, theadRow, totalRow } from "@/components/debtors/bits";
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
      <Shell subtitle="Bank account">
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
      subtitle={`What is in ${account.name} now, who has borrowed from it, and what the balance will be once they pay back.`}
      actions={
        <HeaderButton onClick={() => setAdding({ prefill: "" })}>
          <PersonIcon size={15} />
          Add debtor
        </HeaderButton>
      }
    >
      <div className="flex flex-col gap-2.5">
        <Statement label="Balance now and after repayment">
          <BalanceEditor
            label={`In ${account.name} now`}
            inputLabel={`New ${account.name} balance (৳)`}
            value={now}
            footnote={`Updated ${timestampLong(account.updated_at)}`}
            onSave={(n) => setAccountBalance(account.id, n)}
          />
          <Figure label="+ Owed to you" value={taka(owed)} tone="owed" note={`${owing.length} ${owing.length === 1 ? "person" : "people"} on loans from this account`} />
          <Figure label="= Once everyone pays" value={taka(after)} tone="good" note={`Your ${account.name} balance after repayment`} />
        </Statement>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5 text-[12.5px] text-slate-500">
          <div className="flex h-1.5 min-w-[160px] flex-auto overflow-hidden rounded-full bg-[#E3E1DA]" aria-hidden="true">
            <div className="bg-brand-2" style={{ width: `${inHand}%` }} />
            <div className="bg-[#B9852F]" style={{ width: `${outPct}%` }} />
          </div>
          <span className="whitespace-nowrap">{inHand}% in the bank · {outPct}% lent out</span>
        </div>
      </div>

      <Flash text={flash.text} />

      <ProfileSlider
        title="People"
        sub="Everyone who has borrowed from this account."
        items={profiles.map((p) => ({ ...p, took: p.used }))}
        onOpen={open}
        onAdd={() => setAdding({ prefill: "" })}
      />

      <SectionCard>
        <SectionHead id="deb-h" title="Loans from this account"
          sub="Tap a name to open their profile." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[14px]">
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
                  <tr key={l.id} className={`border-b border-soft ${isNew ? "bg-[#F2F6F3]" : ""}`}>
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{dateLong(l.taken_on)}</td>
                    <th scope="row" className="px-4 py-1.5 text-left">
                      <PersonButton name={name} initials={initials(name)} onClick={() => open(l.person_id)} />
                      {isNew && <> <span className="text-xs font-medium text-brand-2">new</span></>}
                    </th>
                    <td className={td}>{l.reason}</td>
                    <td className={`${td} text-slate-600`}>{l.method}</td>
                    <td className={`${td} money text-right`}>{taka(l.amount)}</td>
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
        <SectionHead id="owe-h" title="Repayment outlook"
          sub={`What each person still owes, biggest first, and your ${account.name} balance as each one pays.`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[14px]">
            <thead>
              <tr className={theadRow}>
                <th scope="col" className={th}>Person</th>
                <th scope="col" className={`${th} text-right`}>Took</th>
                <th scope="col" className={`${th} text-right`}>Paid back</th>
                <th scope="col" className={`${th} text-right`}>Still owes</th>
                <th scope="col" className={th}>Due</th>
                <th scope="col" className={`${th} text-right`}>Balance after</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-soft">
                <th scope="row" className={`${td} text-left font-medium text-slate-500`}>Today</th>
                <td className={`${td} text-right text-slate-400`}>—</td>
                <td className={`${td} text-right text-slate-400`}>—</td>
                <td className={`${td} text-right text-slate-400`}>—</td>
                <td className={`${td} text-slate-400`}>—</td>
                <td className={`${td} money text-right`}>{taka(now)}</td>
              </tr>
              {owingRows.map((p) => (
                <tr key={p.id} className="border-b border-soft">
                  <th scope="row" className="px-4 py-1.5 text-left">
                    <PersonButton name={p.name} initials={p.initials} size={30} onClick={() => open(p.id)} />
                  </th>
                  <td className={`${td} text-right font-mono text-slate-600`}>{taka(p.used)}</td>
                  <td className={`${td} text-right font-mono text-brand-2`}>{p.paid ? taka(p.paid) : "—"}</td>
                  <td className={`${td} money text-right text-[#85570F]`}>{taka(p.owes)}</td>
                  <td className={td}><DuePill kind={p.dueKind}>{p.dueShort}</DuePill></td>
                  <td className={`${td} money text-right`}>{taka(p.run)}</td>
                </tr>
              ))}
              <tr className={totalRow}>
                <th scope="row" className={`${td} text-left`}>Once everyone pays</th>
                <td className={`${td} money text-right`}>{taka(lentTotal)}</td>
                <td className={`${td} money text-right`}>{taka(paidTotal)}</td>
                <td className={`${td} money text-right text-[#85570F]`}>{taka(owed)}</td>
                <td className={td} />
                <td className={`${td} money text-right text-brand-2`}>{taka(after)}</td>
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
