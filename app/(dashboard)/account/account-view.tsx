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
import { FlowChart, OwedRanking, type Flow } from "@/components/charts";
import { SortTh, useSort } from "@/components/sortable";
import { usePalettePeople } from "@/components/command-palette";
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
  const loans = useMemo(
    () => (account ? data.loans.filter((l) => l.account_id === account.id || l.account_id === null) : []),
    [data.loans, account]
  );
  const peopleById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const nameOf = (id: string) => peopleById.get(id)?.name ?? "Unknown";
  const { sorted: loanRows, sort, toggle } = useSort(loans, {
    date: (l) => l.taken_on, person: (l) => nameOf(l.person_id), amount: (l) => l.amount, due: (l) => l.due_on,
  });
  const flows = useMemo<Flow[]>(() => [
    ...loans.map((l) => ({ iso: l.taken_on, amount: l.amount, dir: "out" as const })),
    ...data.repayments.filter((r) => r.applies_to === "loan").map((r) => ({ iso: r.paid_on, amount: r.amount, dir: "in" as const })),
  ], [loans, data.repayments]);
  usePalettePeople(profiles, setOpenId);

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
          <Figure label="+ Owed to you" value={owed} tone="owed" note={`${owing.length} ${owing.length === 1 ? "person" : "people"} on loans from this account`} />
          <Figure label="= Once everyone pays" value={after} tone="good" note={`Your ${account.name} balance after repayment`} />
        </Statement>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5 text-[12.5px] text-slate-500">
          <div className="h-2 min-w-[160px] flex-auto overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div className="bar-fill flex h-full gap-[2px]">
              <div className="rounded-full bg-brand-2 transition-[width] duration-700" style={{ width: `${inHand}%` }} title={`${inHand}% in the bank`} />
              <div className="rounded-full bg-owed-bar transition-[width] duration-700" style={{ width: `${outPct}%` }} title={`${outPct}% lent out`} />
            </div>
          </div>
          <span className="flex items-center gap-3 whitespace-nowrap">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-brand-2" />{inHand}% in the bank</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-owed-bar" />{outPct}% lent out</span>
          </span>
        </div>
      </div>

      <div className="grid items-stretch gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <FlowChart title="Lending activity" sub={`Lent from ${account.name} and paid back, per month. Hover or use ← → for details.`}
          flows={flows} today={today} outLabel="Lent" inLabel="Paid back" />
        <OwedRanking items={profiles} onOpen={open} />
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
          sub="Tap a name to open their profile. Tap a column heading to sort." />
        <div className="overflow-x-auto">
          <table className="stack-table w-full min-w-[900px] border-collapse text-[14px]">
            <thead>
              <tr className={theadRow}>
                <SortTh k="date" label="Date taken" sort={sort} onSort={toggle} />
                <SortTh k="person" label="Person" sort={sort} onSort={toggle} text />
                <th scope="col" className={th}>Why</th>
                <th scope="col" className={th}>How</th>
                <SortTh k="amount" label="Amount" sort={sort} onSort={toggle} right />
                <SortTh k="due" label="Pay back by" sort={sort} onSort={toggle} />
                <th scope="col" className={th}><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody>
              {loanRows.map((l) => {
                const name = nameOf(l.person_id);
                const isNew = l.id === newestForFlash;
                return (
                  <tr key={l.id} className={`border-b border-soft ${isNew ? "animate-highlight bg-good-tint" : ""}`}>
                    <td data-label="Date taken" className={`${td} whitespace-nowrap text-slate-600`}>{dateLong(l.taken_on)}</td>
                    <th scope="row" className="px-4 py-1.5 text-left">
                      <PersonButton name={name} initials={initials(name)} onClick={() => open(l.person_id)} />
                      {isNew && <> <span className="ml-1 rounded-full bg-brand px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-white">new</span></>}
                    </th>
                    <td data-label="Why" className={td}>{l.reason}</td>
                    <td data-label="How" className={`${td} text-slate-600`}>{l.method}</td>
                    <td data-label="Amount" className={`${td} money text-right`}>{taka(l.amount)}</td>
                    <td data-label="Pay back by" className={`${td} whitespace-nowrap`}>{dateLong(l.due_on)}</td>
                    <td className="stack-corner px-2 text-right">
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
          <table className="stack-table w-full min-w-[820px] border-collapse text-[14px]">
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
                <td className={`${td} text-right text-slate-400 stack-hide`}>—</td>
                <td className={`${td} text-right text-slate-400 stack-hide`}>—</td>
                <td className={`${td} text-right text-slate-400 stack-hide`}>—</td>
                <td className={`${td} text-slate-400 stack-hide`}>—</td>
                <td data-label="Balance" className={`${td} money text-right`}>{taka(now)}</td>
              </tr>
              {owingRows.map((p) => (
                <tr key={p.id} className="border-b border-soft">
                  <th scope="row" className="px-4 py-1.5 text-left">
                    <PersonButton name={p.name} initials={p.initials} size={30} onClick={() => open(p.id)} />
                  </th>
                  <td data-label="Took" className={`${td} text-right font-mono text-slate-600`}>{taka(p.used)}</td>
                  <td data-label="Paid back" className={`${td} text-right font-mono text-brand-2`}>{p.paid ? taka(p.paid) : "—"}</td>
                  <td data-label="Still owes" className={`${td} money text-right text-owed`}>{taka(p.owes)}</td>
                  <td data-label="Due" className={td}><DuePill kind={p.dueKind}>{p.dueShort}</DuePill></td>
                  <td data-label="Balance after" className={`${td} money text-right`}>{taka(p.run)}</td>
                </tr>
              ))}
              <tr className={totalRow}>
                <th scope="row" className={`${td} text-left`}>Once everyone pays</th>
                <td data-label="Took" className={`${td} money text-right`}>{taka(lentTotal)}</td>
                <td data-label="Paid back" className={`${td} money text-right`}>{taka(paidTotal)}</td>
                <td data-label="Still owes" className={`${td} money text-right text-owed`}>{taka(owed)}</td>
                <td className={td} />
                <td data-label="Balance after" className={`${td} money text-right text-brand-2`}>{taka(after)}</td>
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
