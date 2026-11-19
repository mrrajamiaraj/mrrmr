"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell, HeaderButton, useViewer } from "@/components/shell";
import { CardIcon, DueIcon, PencilIcon, TrendIcon } from "@/components/icons";
import { BalanceEditor } from "@/components/balance-editor";
import { Avatar, Flash, SectionCard, SectionHead } from "@/components/debtors/bits";
import { EditCardDialog, SetupCard } from "@/components/setup-forms";
import { CardVisual } from "@/components/card-visual";
import { Gauge } from "@/components/viz";
import { SortTh, useSort } from "@/components/sortable";
import { usePalettePeople } from "@/components/command-palette";
import { CardPurchaseDialog } from "@/components/card-purchase-dialog";
import { CardEmiPlans, TxnDrawer, TxnFilters, useTxnFilter } from "@/components/card-sections";
import { RepayDialog } from "@/components/debtors/person-dialogs";
import { repayTargets } from "@/components/debtors/repay-form";
import { DeleteDialog } from "@/components/delete-dialog";
import { Badge, Button, EmptyState, Money } from "@/components/ui";
import { computeDashboard } from "@/lib/dashboard";
import { setCardBalance } from "@/lib/actions";
import { buildCardProfiles, buildProfiles, byOwesThenName, CARD_NAMES, cardPlanStatus, emiSummary, type PlanStatus } from "@/lib/ledger";
import { dateLong, dateShort, initials, taka, timestampLong } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { DeleteItem } from "@/lib/deletion";
import type { CardUse, FinanceData } from "@/lib/types";

/** "Full · by Dec 5" or "EMI 2/6 · next ৳5,000 Dec 5"; late is said in words, not only colour. */
function PlanCell({ s, today }: { s: PlanStatus | undefined; today: string }) {
  if (!s || !s.of) return <span className="text-slate-400">—</span>;
  const late = !!s.next && s.next.iso < today;
  return (
    <span className="flex flex-col items-end leading-snug sm:items-start">
      <span className="font-medium text-slate-700">{s.plan === "emi" ? `EMI ${s.paidCount}/${s.of} paid` : "Full payment"}</span>
      {s.next ? (
        <span className={late ? "font-medium text-bad" : "text-slate-500"}>{late ? "Late · " : ""}{s.plan === "emi" ? `next ${taka(s.next.left)} ` : "by "}{dateShort(s.next.iso)}</span>
      ) : <span className="text-brand-2">Paid</span>}
    </span>
  );
}

/**
 * One credit card: what you owe on it (a liability), when the bill is due, how much of it is your own spending versus
 * other people's purchases (money they owe you), upcoming installments, EMI plans and every transaction.
 * Nothing here moves the bank account or the other card.
 */
export function CardView({ data, slot, today }: { data: FinanceData; slot: 1 | 2; today: string }) {
  const card = data.cards.find((c) => c.slot === slot);
  const viewer = useViewer();
  const router = useRouter();
  const [editingCard, setEditingCard] = useState(false);
  const [buying, setBuying] = useState(false);
  const [viewing, setViewing] = useState<CardUse | null>(null);
  const [deleting, setDeleting] = useState<{ items: DeleteItem[]; title: string } | null>(null);
  const [repaying, setRepaying] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  const people = useMemo(() => (card ? buildCardProfiles(data, card.id, today).sort(byOwesThenName) : []), [data, card, today]);
  const everyone = useMemo(() => buildProfiles(data, today), [data, today]);
  const uses = useMemo(() => (card ? data.cardUses.filter((u) => u.card_id === card.id) : []), [data.cardUses, card]);
  const names = useMemo(() => new Map(data.people.map((p) => [p.id, p.name])), [data.people]);
  const nameOf = (id: string | null) => (!id ? "Me" : names.get(id) ?? "Unknown");
  const txn = useTxnFilter(uses, nameOf);
  const dash = useMemo(() => computeDashboard(data, today), [data, today]);
  const plans = useMemo(() => (card ? cardPlanStatus(data, card.id) : new Map<string, PlanStatus>()), [data, card]);
  const { sorted, sort, toggle } = useSort(txn.rows, { date: (u) => u.used_on, person: (u) => nameOf(u.person_id), amount: (u) => u.amount });
  usePalettePeople(everyone, (id) => id && router.push(`/debtors/${id}`));

  if (!card) {
    return <Shell subtitle={CARD_NAMES[slot]}><SetupCard slot={slot} /></Shell>;
  }

  const c = dash.cards.find((x) => x.card.id === card.id)!;
  const owing = people.filter((p) => p.owes > 0);
  const myTotal = sumBy(uses.filter((u) => !u.person_id), (u) => u.amount);
  const upcoming = dash.open.filter((o) => o.cardId === card.id && o.iso).slice(0, 8);
  const share = c.balance > 0 ? Math.min(Math.max((c.othersOwe / c.balance) * 100, 0), 100) : 0;
  const rp = repaying ? everyone.find((p) => p.id === repaying) : undefined;
  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;

  const askDelete = (u: CardUse) => setDeleting({
    items: [{ kind: "card_use", id: u.id }],
    title: u.person_id ? `Delete ${nameOf(u.person_id)}'s purchase?` : "Delete your purchase?",
  });

  return (
    <Shell subtitle={`${card.bank} ${card.network ?? ""} · ${card.name}`.replace("  ", " ")}
      actions={<HeaderButton onClick={() => setBuying(true)}><CardIcon size={15} />Add purchase</HeaderButton>}>

      <section aria-label="This card" className="grid items-start gap-5 lg:grid-cols-[minmax(280px,400px)_minmax(0,1fr)]">
        <div className="mx-auto flex w-full max-w-[400px] flex-col items-center gap-6 pt-2">
          <CardVisual card={card} />
          {c.limit != null && c.utilization != null && (
            <Gauge pct={c.utilization} label="of the limit used" sub={`${taka(c.balance)} of ${taka(c.limit)} · ${taka(c.available ?? 0)} available`} />
          )}
        </div>

        <div className="surface-card flex flex-col overflow-hidden">
          <div className="grid sm:grid-cols-2 [&>*+*]:border-t [&>*+*]:border-line sm:[&>*+*]:border-l sm:[&>*+*]:border-t-0">
            <BalanceEditor label="You owe on this card" inputLabel="Card balance from your statement (৳)" value={card.balance}
              footnote={`As you last entered it · ${timestampLong(card.updated_at)}`} onSave={(n) => setCardBalance(card.id, n)} />
            <div className="flex flex-col gap-1.5 px-4 py-4 sm:px-5 sm:py-5">
              <span className="flex min-h-7 items-center justify-between gap-2"><span className="eyebrow">Pay by</span>
                {!viewer && <button type="button" onClick={() => setEditingCard(true)} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line px-2.5 text-[12.5px] font-medium text-brand-2 hover:bg-good-tint"><PencilIcon size={13} />Edit</button>}
              </span>
              <span className={`text-figure font-medium ${c.payByPassed ? "text-bad" : ""}`}>{card.pay_by ? dateLong(card.pay_by) : "Not set"}</span>
              <span className={`text-[12.5px] ${c.payByPassed ? "font-medium text-bad" : "text-slate-500"}`}>
                {c.payByPassed ? <><DueIcon size={12} className="mr-1 inline" />Date passed — update it from your new statement</> : card.pay_by ? "Your card bill (full balance)" : "Add the date from your statement"}
              </span>
            </div>
          </div>

          {/* Whose spending the balance is: a simple split, every part labelled with its amount. */}
          <div className="flex flex-col gap-2.5 border-t border-line px-4 py-4 sm:px-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-soft" role="img" aria-label={`Of ${taka(c.balance)}: other people owe you ${taka(c.othersOwe)}; your own share ${taka(Math.max(c.myShare, 0))}`}>
              <span className="bar-fill h-full bg-owed-bar" style={{ width: `${share}%` }} />
              <span className="bar-fill h-full bg-slate-500" style={{ width: `${100 - share}%` }} />
            </div>
            <dl className="m-0 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="flex items-center gap-1.5 text-[12.5px] text-slate-500"><span aria-hidden="true" className="size-2 rounded-full bg-owed-bar" />Other people&apos;s purchases — they owe you</dt>
                <dd className="m-0"><Money value={c.othersOwe} tone="owed" className="text-[19px]" /><span className="ml-1.5 text-[12px] text-slate-500">{owing.length} {owing.length === 1 ? "person" : "people"}</span></dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-[12.5px] text-slate-500"><span aria-hidden="true" className="size-2 rounded-full bg-slate-500" />Your own share of the balance</dt>
                <dd className="m-0"><Money value={c.myShare} className="text-[19px]" /><span className="ml-1.5 text-[12px] text-slate-500">{taka(myTotal)} spent by you in total</span></dd>
              </div>
            </dl>
            {c.myShare < 0 && <p className="m-0 text-[12.5px] font-medium text-owed">Others owe more than the card balance — the balance may be out of date.</p>}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-subtle px-4 py-3 text-[13px] sm:px-5">
            {c.limit != null ? (
              <>
                <span>Limit <Money value={c.limit} /></span>
                <span>Available <Money value={c.available ?? 0} tone="good" /></span>
                <span className={c.utilization! >= 80 ? "font-medium text-bad" : "text-slate-600"}>{c.utilization}% used{c.utilization! >= 80 ? " — high" : ""}</span>
              </>
            ) : <span className="text-slate-500">No credit limit recorded.</span>}
            {c.emiOutstanding > 0 && <span className="text-slate-600">EMI still to come <Money value={c.emiOutstanding} tone="owed" /></span>}
          </div>
        </div>
      </section>

      <Flash text={flash} />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <SectionCard labelledBy="up-h">
          <SectionHead id="up-h" title="Upcoming payments" sub="Your card bill, then what people owe on this card by date." />
          <ul className="m-0 list-none border-t border-line p-0">
            {card.pay_by && card.balance > 0 && (
              <li className="flex items-center justify-between gap-3 border-b border-soft bg-subtle px-4 py-2.5 sm:px-5">
                <span className="text-[13.5px]"><span className={`font-medium ${c.payByPassed ? "text-bad" : ""}`}>{dateLong(card.pay_by)}</span>
                  <span className="block text-[12.5px] text-slate-500">You pay the bank{c.payByPassed ? " · date passed" : ""}</span></span>
                <Money value={card.balance} tone="bad" />
              </li>
            )}
            {upcoming.map((o) => (
              <li key={o.key} className="flex items-center justify-between gap-3 border-b border-soft px-4 py-2.5 last:border-0 sm:px-5">
                <Link href={`/debtors/${o.personId}`} className="min-w-0 text-[13.5px] hover:text-brand-ink">
                  <span className={`font-medium ${o.status === "overdue" ? "text-bad" : ""}`}>{o.status === "overdue" && <DueIcon size={12} className="mr-1 inline" />}{dateShort(o.iso)} · {o.name}</span>
                  <span className="block text-[12.5px] text-slate-500">{o.emi ? "EMI installment" : "Full payment"}{o.status === "overdue" ? " · overdue" : ""}</span>
                </Link>
                <Money value={o.left} tone={o.status === "overdue" ? "bad" : "owed"} />
              </li>
            ))}
            {!upcoming.length && !(card.pay_by && card.balance > 0) && <li className="p-4"><EmptyState compact title="Nothing scheduled" /></li>}
          </ul>
        </SectionCard>

        <SectionCard labelledBy="who-h">
          <SectionHead id="who-h" title="Who owes on this card" sub="Their purchases on this card, less what they've repaid for it." />
          <ul className="m-0 list-none border-t border-line p-0">
            {owing.map((p) => {
              const emi = emiSummary([...plans.values()].filter((s) => s.personId === p.id));
              return (
                <li key={p.id} className="flex items-center gap-3 border-b border-soft px-4 py-2.5 last:border-0 sm:px-5">
                  <Avatar text={p.initials} size={32} />
                  <Link href={`/debtors/${p.id}`} className="min-w-0 flex-auto hover:text-brand-ink">
                    <span className="block truncate text-[14px] font-medium">{p.name}</span>
                    <span className={`block truncate text-[12px] ${p.dueKind === "late" ? "font-medium text-bad" : "text-slate-500"}`}>{p.dueKind === "late" ? "Overdue · " : ""}{emi ?? (p.due ? `Due ${dateShort(p.due)}` : "No due date")}</span>
                  </Link>
                  <Money value={p.owes} tone={p.dueKind === "late" ? "bad" : "owed"} />
                  {!viewer && <Button size="sm" variant="secondary" onClick={() => setRepaying(p.id)} aria-label={`Record a repayment from ${p.name}`} className="max-sm:px-2.5"><TrendIcon size={14} /><span className="max-sm:hidden">Repay</span></Button>}
                </li>
              );
            })}
            {!owing.length && <li className="p-4"><EmptyState compact title="Nobody owes on this card">{people.length ? "Everyone has paid back their purchases." : "Purchases by other people appear here."}</EmptyState></li>}
          </ul>
        </SectionCard>
      </div>

      <CardEmiPlans plans={[...plans.values()]} names={names} today={today} />

      <SectionCard labelledBy="log-h">
        <SectionHead id="log-h" title="Transactions" sub="Every purchase on this card. Open one for its breakdown and EMI schedule." />
        <TxnFilters f={txn.f} setF={txn.setF} shown={txn.rows.length} total={uses.length}
          people={[...new Map(uses.filter((u) => u.person_id).map((u) => [u.person_id!, { id: u.person_id!, name: nameOf(u.person_id) }])).values()].sort((a, b) => a.name.localeCompare(b.name))} />
        <div className="overflow-x-auto">
          <table className="stack-table w-full min-w-[720px] border-collapse text-[14px]">
            <thead>
              <tr className="border-y border-line bg-subtle text-left">
                <SortTh k="date" label="Date" sort={sort} onSort={toggle} />
                <SortTh k="person" label="Whose" sort={sort} onSort={toggle} text />
                <th scope="col" className="px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">What</th>
                <SortTh k="amount" label="Amount" sort={sort} onSort={toggle} right />
                <th scope="col" className="px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">Pay back</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((u) => {
                const me = !u.person_id;
                return (
                  <tr key={u.id} className="border-b border-soft">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{dateLong(u.used_on)}</td>
                    <td data-label="Whose" className="px-4 py-3">
                      {me ? <Badge className="text-[11.5px]">My spending</Badge>
                        : <span className="inline-flex items-center gap-2"><Avatar text={initials(nameOf(u.person_id))} size={24} /><span className="font-medium">{nameOf(u.person_id)}</span></span>}
                    </td>
                    <td data-label="What" className="px-4 py-3">
                      <button type="button" onClick={() => setViewing(u)} className="min-h-9 text-left font-medium underline decoration-line-strong underline-offset-4 hover:text-brand-ink hover:decoration-brand-2">{u.reason_or_place}</button>
                      <span className="flex flex-wrap justify-end gap-1 sm:justify-start">
                        <span className="text-[12px] text-slate-500">{u.category}</span>
                        {u.purchase_group && <Badge tone="info" className="text-[10.5px]">Split</Badge>}
                      </span>
                    </td>
                    <td data-label="Amount" className={`money whitespace-nowrap px-4 py-3 text-right ${me ? "text-slate-600" : ""}`}>{taka(u.amount)}</td>
                    <td data-label="Pay back" className="px-4 py-3 text-[13px]">{me ? <span className="text-slate-500">You pay the bank</span> : <PlanCell s={plans.get(u.id)} today={today} />}</td>
                  </tr>
                );
              })}
              {uses.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nothing recorded on this card yet.</td></tr>}
              {uses.length > 0 && txn.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No transactions match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {editingCard && <EditCardDialog card={card} onClose={() => setEditingCard(false)} />}
      {buying && (
        <CardPurchaseDialog cards={data.cards} initialCardId={card.id} knownNames={data.people.map((p) => p.name)}
          onClose={() => setBuying(false)} onSaved={(text) => { setBuying(false); setFlash(text); }} />
      )}
      {viewing && (
        <TxnDrawer u={viewing} all={uses} plan={plans.get(viewing.id)} nameOf={nameOf} viewer={viewer} today={today}
          onClose={() => setViewing(null)} onDelete={() => { const u = viewing; setViewing(null); askDelete(u); }} />
      )}
      {deleting && (
        <DeleteDialog data={data} today={today} items={deleting.items} title={deleting.title}
          onClose={() => setDeleting(null)} onDone={(msg) => { setDeleting(null); setFlash(msg); }} />
      )}
      {rp && (
        <RepayDialog p={rp} targets={repayTargets(rp, data.cards).sort((a, b) => (a.cardId === card.id ? -1 : b.cardId === card.id ? 1 : 0))} account={account}
          onClose={() => setRepaying(null)} onSaved={(t) => { setRepaying(null); setFlash(t); }} />
      )}
    </Shell>
  );
}
