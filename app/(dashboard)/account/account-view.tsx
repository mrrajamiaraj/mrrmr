"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell, useViewer } from "@/components/shell";
import { BalanceEditor } from "@/components/balance-editor";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { RepayDialog } from "@/components/debtors/person-dialogs";
import { repayTargets } from "@/components/debtors/repay-form";
import { Flash } from "@/components/debtors/bits";
import { SetupAccount } from "@/components/setup-forms";
import { DebitUsed } from "@/components/debit-used";
import { usePalettePeople } from "@/components/command-palette";
import { CardsStrip, Hero, RepayPicker } from "@/components/dashboard";
import { Button, buttonClass, Menu, type MenuItem } from "@/components/ui";
import { CardIcon, PlusIcon, TrendIcon } from "@/components/icons";
import { CardPurchaseDialog } from "@/components/card-purchase-dialog";
import { BankMovements } from "@/components/bank-movements";
import { setAccountBalance } from "@/lib/actions";
import { buildProfiles, byOwesThenName, cardLabel } from "@/lib/ledger";
import { computeDashboard } from "@/lib/dashboard";
import { monthlySeries } from "@/lib/trends";
import { timestampLong } from "@/lib/format";
import type { FinanceData } from "@/lib/types";

/**
 * Overview: cash in the bank, what people owe you, what you owe on cards (three separate figures, each a link),
 * what needs attention now, the two cards, recent activity — then the City Bank tools.
 */
export function AccountView({ data, today, hour }: { data: FinanceData; today: string; hour: number }) {
  const viewer = useViewer();
  const router = useRouter();
  const account = data.accounts[0];
  const [adding, setAdding] = useState<{ mode: "loan" } | { mode: "card"; cardId: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [repaying, setRepaying] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  const d = useMemo(() => computeDashboard(data, today), [data, today]);
  // Start the chart at the first month that has records (at least 4 months shown), so it isn't a long flat line.
  const trend = useMemo(() => {
    const s = monthlySeries(data, today, 12);
    const first = s.findIndex((p) => p.owedEnd > 0 || p.lent > 0 || p.repaid > 0);
    return first < 0 ? s.slice(-4) : s.slice(Math.min(Math.max(first - 1, 0), s.length - 4));
  }, [data, today]);
  const profiles = useMemo(() => buildProfiles(data, today).sort(byOwesThenName), [data, today]);
  usePalettePeople(profiles, (id) => id && router.push(`/debtors/${id}`));

  if (!account) {
    return (
      <Shell subtitle="Set up your bank account to start">
        <SetupAccount />
      </Shell>
    );
  }

  const acct = { id: account.id, name: account.name };
  const rp = repaying ? profiles.find((p) => p.id === repaying) : undefined;
  const cardItems: MenuItem[] = data.cards.map((c) => ({ label: cardLabel(c), icon: <CardIcon size={17} />, onSelect: () => setAdding({ mode: "card", cardId: c.id }) }));

  return (
    <Shell subtitle="" hero={
      <Hero d={d} hour={hour} trend={trend} actions={!viewer && <>
        <Button onClick={() => setPicking(true)} className="shine flex-auto sm:flex-none"><TrendIcon size={15} />Record repayment</Button>
        <Button variant="secondary" onClick={() => setAdding({ mode: "loan" })} className="flex-auto sm:flex-none"><PlusIcon size={15} />Add loan</Button>
        {data.cards.length > 0 && (
          <Menu label="Add a card purchase" align="end" items={cardItems}
            triggerClass={buttonClass("secondary", "md", "flex-auto sm:flex-none")} trigger={<><CardIcon size={15} />Card purchase</>} />
        )}
      </>} />
    }>
      <Flash text={flash} />

      <div className="reveal"><CardsStrip d={d} /></div>

      <section id="bank" aria-labelledby="bank-h" className="reveal flex scroll-mt-20 flex-col gap-4 border-t border-line pt-6">
        <div>
          <h2 id="bank-h" className="m-0 font-display text-[26px] font-normal">{account.name}</h2>
          <p className="m-0 mt-1 text-small text-slate-500">The balance you keep up to date, your debit-card tally, and the money in and out the app recorded.</p>
        </div>
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="surface-card overflow-hidden">
            <BalanceEditor label={`Balance in ${account.name}`} inputLabel={`New ${account.name} balance (৳)`} value={account.balance}
              footnote={`Updated ${timestampLong(account.updated_at)}`} onSave={(n) => setAccountBalance(account.id, n)} />
          </div>
          <DebitUsed accountId={account.id} total={account.debit_used} />
        </div>
        <BankMovements data={data} accountId={account.id} accountName={account.name} onOpen={(id) => router.push(`/debtors/${id}`)} />
      </section>

      {adding?.mode === "loan" && (
        <AddDebtorDialog mode="loan" title={`Add loan — ${account.name}`} account={acct} knownNames={data.people.map((p) => p.name)}
          onClose={() => setAdding(null)}
          onAdded={(personId, text) => { setAdding(null); setFlash(text); if (personId) router.push(`/debtors/${personId}`); }} />
      )}
      {adding?.mode === "card" && (
        <CardPurchaseDialog cards={data.cards} initialCardId={adding.cardId} knownNames={data.people.map((p) => p.name)}
          onClose={() => setAdding(null)} onSaved={(text) => { setAdding(null); setFlash(text); }} />
      )}
      {picking && (
        <RepayPicker people={profiles.filter((p) => p.owes > 0).map((p) => ({ id: p.id, name: p.name, owes: p.owes, status: p.status }))}
          onClose={() => setPicking(false)} onPick={(id) => { setPicking(false); setRepaying(id); }} />
      )}
      {rp && (
        <RepayDialog p={rp} targets={repayTargets(rp, data.cards)} account={acct}
          onClose={() => setRepaying(null)} onSaved={(t) => { setRepaying(null); setFlash(t); }} />
      )}
    </Shell>
  );
}
