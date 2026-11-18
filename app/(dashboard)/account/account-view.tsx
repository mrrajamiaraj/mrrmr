"use client";

import { useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { BalanceEditor, Figure, Statement } from "@/components/balance-editor";
import { ProfileSlider } from "@/components/debtors/profile-slider";
import { ProfileModal } from "@/components/debtors/profile-modal";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { DuePill, Flash, PersonButton, SectionCard, SectionHead, td, th, theadRow, totalRow } from "@/components/debtors/bits";
import { SetupAccount } from "@/components/setup-forms";
import { DebitUsed } from "@/components/debit-used";
import { DeleteButton, DeleteRecordDialog, undoText, type DeleteTarget } from "@/components/delete-record-dialog";
import { SortTh, useSort } from "@/components/sortable";
import { usePalettePeople } from "@/components/command-palette";
import {
  ActivityFeed, CardsPreview, CashMovement, CustomizeDialog, Hero, Insights, QuickActions, Receivables, RepayPicker, Snapshot,
} from "@/components/dashboard";
import { Button } from "@/components/ui";
import { CardPurchaseDialog } from "@/components/card-purchase-dialog";
import { BankMovements } from "@/components/bank-movements";
import { setAccountBalance } from "@/lib/actions";
import { buildLoanProfiles, buildProfiles, byOwesThenName } from "@/lib/ledger";
import { computeDashboard } from "@/lib/dashboard";
import type { DashboardLayout, SectionId } from "@/lib/dashboard-layout";
import { dateLong, initials, pct, taka, timestampLong } from "@/lib/format";
import { sumBy, sumMoney } from "@/lib/money";
import type { FinanceData } from "@/lib/types";

type Open = { id: string; scope: "all" | "bank" };

/**
 * Overview: the home dashboard. Hero (financial position + quick actions), then the sections in the admin's saved
 * order. The City Bank tools that used to be this page live on unchanged in the "City Bank details" section.
 */
export function AccountView({ data, today, hour, layout: initialLayout }: { data: FinanceData; today: string; hour: number; layout: DashboardLayout }) {
  const account = data.accounts[0];
  const [open, setOpen] = useState<Open | null>(null);
  const [adding, setAdding] = useState<{ mode: "loan"; prefill: string } | { mode: "card"; cardId: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [layout, setLayout] = useState(initialLayout);
  const [flash, setFlash] = useState({ text: "", personId: "" });
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  const d = useMemo(() => computeDashboard(data, today), [data, today]);
  const allProfiles = useMemo(() => buildProfiles(data, today).sort(byOwesThenName), [data, today]);
  // Bank section: loans only (card use lives on the card pages).
  const profiles = useMemo(() => buildLoanProfiles(data, today).sort(byOwesThenName), [data, today]);
  usePalettePeople(allProfiles, (id) => setOpen(id ? { id, scope: "all" } : null));

  if (!account) {
    return (
      <Shell subtitle="Set up your bank account to start">
        <SetupAccount />
      </Shell>
    );
  }

  const acct = { id: account.id, name: account.name };
  const openAll = (id: string) => setOpen({ id, scope: "all" });
  const pv = open ? (open.scope === "all" ? allProfiles : profiles).find((p) => p.id === open.id) : undefined;
  const addingCard = adding?.mode === "card" ? data.cards.find((c) => c.id === adding.cardId) : undefined;

  const sections: Record<SectionId, React.ReactNode> = {
    insights: <Insights d={d} />,
    snapshot: <Snapshot d={d} />,
    cashflow: <CashMovement data={data} today={today} />,
    receivables: <Receivables d={d} onOpen={openAll} />,
    cards: <CardsPreview d={d} />,
    activity: <ActivityFeed d={d} onOpen={openAll} />,
    bank: <BankDetails data={data} today={today} profiles={profiles} flashPersonId={flash.personId}
      onOpen={(id) => setOpen({ id, scope: "bank" })} onAdd={() => setAdding({ mode: "loan", prefill: "" })} onDelete={setDeleting} />,
  };

  return (
    <Shell subtitle="" hero={
      <Hero d={d} hour={hour} actions={
        <QuickActions d={d}
          onAddLoan={() => setAdding({ mode: "loan", prefill: "" })}
          onCardUse={(cardId) => setAdding({ mode: "card", cardId })}
          onRepay={() => setPicking(true)} />
      } />
    }>
      {layout.order.filter((id) => !layout.hidden.includes(id)).map((id) => <div key={id} className="contents">{sections[id]}</div>)}

      <div className="flex justify-center pt-2">
        <Button variant="ghost" size="sm" onClick={() => setCustomizing(true)}>Customize dashboard</Button>
      </div>

      <Flash text={flash.text} />

      {adding?.mode === "loan" && (
        <AddDebtorDialog mode="loan" title={`Add loan — ${account.name}`} account={acct}
          knownNames={data.people.map((p) => p.name)} prefillName={adding.prefill}
          onClose={() => setAdding(null)}
          onAdded={(personId, text) => { setAdding(null); setFlash({ text, personId: personId ?? "" }); if (personId) setOpen({ id: personId, scope: "bank" }); }} />
      )}
      {addingCard && (
        <CardPurchaseDialog cards={data.cards} initialCardId={addingCard.id} knownNames={data.people.map((p) => p.name)}
          onClose={() => setAdding(null)}
          onSaved={(text, personId) => { setAdding(null); setFlash({ text, personId: "" }); if (personId) openAll(personId); }} />
      )}
      {picking && (
        <RepayPicker people={allProfiles.filter((p) => p.owes > 0).map((p) => ({ id: p.id, name: p.name, owes: p.owes, status: p.status }))}
          onClose={() => setPicking(false)} onPick={(id) => { setPicking(false); openAll(id); }} />
      )}
      {customizing && <CustomizeDialog layout={layout} onClose={() => setCustomizing(false)} onChange={setLayout} />}

      {pv && open && (
        <ProfileModal profile={pv} variant={open.scope} cards={data.cards} account={acct} today={today}
          onClose={() => setOpen(null)}
          onMore={() => { setOpen(null); setAdding({ mode: "loan", prefill: pv.name }); }}
          onSaved={(text) => setFlash({ text, personId: "" })} />
      )}
      {deleting && (
        <DeleteRecordDialog target={deleting} onClose={() => setDeleting(null)}
          onDone={(text) => { setDeleting(null); setFlash({ text, personId: "" }); }} />
      )}
    </Shell>
  );
}

/** The City Bank tools from the former Bank Account page, unchanged in behaviour. */
function BankDetails({ data, today, profiles, flashPersonId, onOpen, onAdd, onDelete }: {
  data: FinanceData; today: string; profiles: ReturnType<typeof buildLoanProfiles>; flashPersonId: string;
  onOpen: (id: string) => void; onAdd: () => void; onDelete: (t: DeleteTarget) => void;
}) {
  const account = data.accounts[0];
  const loans = useMemo(() => data.loans.filter((l) => l.account_id === account.id || l.account_id === null), [data.loans, account.id]);
  const peopleById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const nameOf = (id: string) => peopleById.get(id)?.name ?? "Unknown";
  const { sorted: loanRows, sort, toggle } = useSort(loans, { date: (l) => l.taken_on, person: (l) => nameOf(l.person_id), amount: (l) => l.amount });

  // Display totals, summed exactly in paisa (lib/money); the balance itself comes from the database.
  const now = account.balance;
  const owing = profiles.filter((p) => p.owes > 0);
  let run = now;
  const owingRows = owing.map((p) => ({ ...p, run: (run = sumMoney([run, p.owes])) }));
  const owed = sumBy(owing, (p) => p.owes);
  const lentTotal = sumBy(owing, (p) => p.used);
  const paidTotal = sumBy(owing, (p) => p.paid);
  const after = sumMoney([now, owed]);
  const inHand = after ? pct(now, after, 1) : 100;
  const outPct = Math.round((100 - inHand) * 10) / 10;
  const newest = flashPersonId ? loans.filter((l) => l.person_id === flashPersonId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id : undefined;
  void today;

  return (
    <section id="bank" aria-labelledby="bank-h" className="flex scroll-mt-20 flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="bank-h" className="m-0 font-display text-[26px] font-normal">{account.name} details</h2>
          <p className="m-0 mt-1 text-small text-slate-500">Edit the balance, track debit-card use, and see every loan made from this account.</p>
        </div>
        <Button variant="secondary" onClick={onAdd}>Add loan</Button>
      </div>

      <div className="flex flex-col gap-2.5">
        <Statement label="Balance now and after repayment">
          <BalanceEditor label={`In ${account.name} now`} inputLabel={`New ${account.name} balance (৳)`} value={now}
            footnote={`Updated ${timestampLong(account.updated_at)}`} onSave={(n) => setAccountBalance(account.id, n)} />
          <Figure label="+ Owed to you" value={owed} tone="owed" note={`${owing.length} ${owing.length === 1 ? "person" : "people"} on loans from this account`} />
          <Figure label="= Once everyone pays" value={after} tone="good" note={`Projection — not available until repaid`} />
        </Statement>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5 text-[12.5px] text-slate-500">
          <div className="h-2 min-w-[160px] flex-auto overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div className="bar-fill flex h-full gap-[2px]">
              <div className="rounded-full bg-brand-2" style={{ width: `${inHand}%` }} />
              <div className="rounded-full bg-owed-bar" style={{ width: `${outPct}%` }} />
            </div>
          </div>
          <span className="flex items-center gap-3 whitespace-nowrap">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-brand-2" />{inHand}% in the bank</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-owed-bar" />{outPct}% lent out</span>
          </span>
        </div>
      </div>

      <DebitUsed accountId={account.id} total={account.debit_used} />

      <BankMovements data={data} accountId={account.id} accountName={account.name} onOpen={onOpen} />

      <ProfileSlider title="People" sub="Everyone who has borrowed from this account."
        items={profiles.map((p) => ({ ...p, took: p.used }))} onOpen={onOpen} onAdd={onAdd} />

      <SectionCard labelledBy="deb-h">
        <SectionHead id="deb-h" title="Loans from this account" sub="Tap a name to open their profile. Tap a column heading to sort." />
        <div className="overflow-x-auto">
          <table className="stack-table w-full min-w-[900px] border-collapse text-[14px]">
            <thead>
              <tr className={theadRow}>
                <SortTh k="date" label="Date taken" sort={sort} onSort={toggle} />
                <SortTh k="person" label="Person" sort={sort} onSort={toggle} text />
                <th scope="col" className={th}>Why</th>
                <th scope="col" className={th}>How</th>
                <SortTh k="amount" label="Amount" sort={sort} onSort={toggle} right />
                <th scope="col" className={th}><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody>
              {loanRows.map((l) => {
                const name = nameOf(l.person_id);
                const isNew = l.id === newest;
                return (
                  <tr key={l.id} className={`border-b border-soft ${isNew ? "animate-highlight bg-good-tint" : ""}`}>
                    <td data-label="Date taken" className={`${td} whitespace-nowrap text-slate-600`}>{dateLong(l.taken_on)}</td>
                    <th scope="row" className="px-4 py-1.5 text-left">
                      <PersonButton name={name} initials={initials(name)} onClick={() => onOpen(l.person_id)} />
                      {isNew && <> <span className="ml-1 rounded-full bg-brand px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-white">new</span></>}
                    </th>
                    <td data-label="Why" className={td}>{l.reason}</td>
                    <td data-label="How" className={`${td} text-slate-600`}>{l.method}</td>
                    <td data-label="Amount" className={`${td} money text-right`}>{taka(l.amount)}</td>
                    <td className="stack-corner px-2 text-right">
                      <DeleteButton label={`Delete loan to ${name}, ${taka(l.amount)}`} onClick={() => onDelete({
                        kind: "loan", id: l.id, amount: l.amount, iso: l.taken_on, what: `Loan to ${name} — ${l.reason}`,
                        undo: l.account_id ? undoText("loan", l.amount, account.name) : null,
                      })} />
                    </td>
                  </tr>
                );
              })}
              {loans.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No loans from this account yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard labelledBy="owe-h">
        <SectionHead id="owe-h" title="Repayment outlook" sub={`What each person still owes on bank loans, biggest first, and your ${account.name} balance as each one pays (a projection).`} />
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
                  <th scope="row" className="px-4 py-1.5 text-left"><PersonButton name={p.name} initials={p.initials} size={30} onClick={() => onOpen(p.id)} /></th>
                  <td data-label="Took" className={`${td} money text-right text-slate-600`}>{taka(p.used)}</td>
                  <td data-label="Paid back" className={`${td} money text-right text-brand-2`}>{p.paid ? taka(p.paid) : "—"}</td>
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
    </section>
  );
}
