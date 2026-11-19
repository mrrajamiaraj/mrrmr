"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell, useViewer } from "@/components/shell";
import { Figure, Statement } from "@/components/balance-editor";
import { Avatar, Flash, SectionCard, SectionHead, StatusPill } from "@/components/debtors/bits";
import { RepayDialog } from "@/components/debtors/person-dialogs";
import { repayTargets } from "@/components/debtors/repay-form";
import { Badge, Button, EmptyState, Money, type BadgeTone } from "@/components/ui";
import { AlertIcon, DueIcon, InfoIcon } from "@/components/icons";
import { usePalettePeople } from "@/components/command-palette";
import { DateChip } from "@/components/viz";
import { computeDashboard, type OpenItem } from "@/lib/dashboard";
import { findAnomalies } from "@/lib/anomalies";
import { buildProfiles, byOwesThenName, cardLabel } from "@/lib/ledger";
import { addDays, dateLong, dateShort, initials } from "@/lib/format";
import { sumBy } from "@/lib/money";
import type { FinanceData } from "@/lib/types";

/** Everything about getting paid back, in one place. Figures from lib/dashboard; checks from lib/anomalies. */
export function RepaymentsView({ data, today }: { data: FinanceData; today: string }) {
  const d = useMemo(() => computeDashboard(data, today), [data, today]);
  const profiles = useMemo(() => buildProfiles(data, today).sort(byOwesThenName), [data, today]);
  const anomalies = useMemo(() => findAnomalies(data, d, today), [data, d, today]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flash, setFlash] = useState("");
  const viewer = useViewer();
  const router = useRouter();
  usePalettePeople(profiles, (id) => id && router.push(`/debtors/${id}`));
  const go = (id: string) => router.push(`/debtors/${id}`);

  const since = addDays(today, -30);
  const recent = data.repayments.filter((r) => r.paid_on >= since && r.paid_on <= today).sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at));
  const recentSum = sumBy(recent, (r) => r.amount);
  const upcoming = d.open.filter((o) => o.iso && o.iso >= today && o.iso <= addDays(today, 30));
  const overdue = d.open.filter((o) => o.status === "overdue");
  const name = (id: string) => data.people.find((p) => p.id === id)?.name ?? "Unknown";
  const owing = profiles.filter((p) => p.owes > 0);
  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;
  const pv = openId ? profiles.find((p) => p.id === openId) : undefined;

  return (
    <Shell subtitle="Who owes what and when, what came in recently, and anything in the records that needs a look.">
      <Statement label="Collections" cols={4}>
        <Figure label="Outstanding" value={d.receivables.total} tone="owed" note={`${owing.length} people`} />
        <Figure label="Overdue" value={d.overdue.amount} tone={d.overdue.amount ? "owed" : "muted"} note={`${d.overdue.count} item${d.overdue.count === 1 ? "" : "s"}`} />
        <Figure label="Due in 30 days" value={sumBy(upcoming, (o) => o.left)} note={`${upcoming.length} item${upcoming.length === 1 ? "" : "s"}`} />
        <Figure label="Collected, last 30 days" value={recentSum} tone="good" note={`${recent.length} payment${recent.length === 1 ? "" : "s"}`} />
      </Statement>

      <Flash text={flash} />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <DueList title="Overdue" id="ov-h" items={overdue} empty="Nothing is overdue." onOpen={go} cards={data.cards} tone="bad" today={today} />
        <DueList title="Due in the next 30 days" id="up-h" items={upcoming} empty="Nothing is due in the next 30 days." onOpen={go} cards={data.cards} tone="owed" today={today} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard labelledBy="who-h">
          <SectionHead id="who-h" title="Who owes" sub="Biggest first. “Record” takes a repayment without leaving this page." />
          <ul className="m-0 list-none border-t border-line p-0">
            {owing.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-b border-soft px-4 py-2.5 last:border-0 sm:px-5">
                <Avatar text={p.initials} size={32} />
                <span className="min-w-0 flex-auto">
                  <Link href={`/debtors/${p.id}`} className="block truncate text-[14px] font-medium hover:text-brand-ink hover:underline">{p.name}</Link>
                  <span className="text-[12px] text-slate-500">{p.due ? `${p.dueKind === "late" ? "Overdue since" : "Next"} ${dateShort(p.due)}` : "No due date"} · {p.pct}% repaid</span>
                </span>
                <StatusPill status={p.status} className="max-sm:hidden" />
                <Money value={p.owes} tone="owed" className="w-[92px] text-right" />
                {!viewer && <Button size="sm" variant="secondary" onClick={() => setOpenId(p.id)} aria-label={`Record a repayment from ${p.name}`}>Record</Button>}
              </li>
            ))}
            {!owing.length && <li className="p-5"><EmptyState compact title="Nobody owes you">Everything lent has been repaid.</EmptyState></li>}
          </ul>
        </SectionCard>

        <div className="flex flex-col gap-5">
          <SectionCard labelledBy="rec-h">
            <SectionHead id="rec-h" title="Recently collected" sub={`Since ${dateLong(since)}.`} />
            <ul className="m-0 max-h-[360px] list-none overflow-y-auto border-t border-line p-0">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 border-b border-soft px-4 py-2 last:border-0 sm:px-5">
                  <span className="min-w-0 text-[13px]"><span className="block truncate font-medium">{name(r.person_id)}</span>
                    <span className="text-[12px] text-slate-500">{dateShort(r.paid_on)} · {r.via} · {r.applies_to === "card" ? cardLabel(data.cards.find((c) => c.id === r.card_id)) : "loan"}{r.account_id ? " · into bank" : ""}</span></span>
                  <Money value={r.amount} tone="good" signed />
                </li>
              ))}
              {!recent.length && <li className="p-4 text-[13px] text-slate-500">No repayments in the last 30 days.</li>}
            </ul>
          </SectionCard>
        </div>
      </div>

      <SectionCard labelledBy="chk-h">
        <SectionHead id="chk-h" title="Data checks" sub="Deterministic checks on your records. They only point things out — nothing is changed or deleted." />
        {anomalies.length ? (
          <ul className="m-0 list-none border-t border-line p-0">
            {anomalies.map((a) => {
              const tone: BadgeTone = a.severity === "high" ? "bad" : a.severity === "medium" ? "owed" : "info";
              const body = (
                <>
                  <span aria-hidden="true" className={`mt-0.5 ${a.severity === "high" ? "text-bad" : a.severity === "medium" ? "text-owed" : "text-info"}`}>{a.severity === "low" ? <InfoIcon size={16} /> : <AlertIcon size={16} />}</span>
                  <span className="min-w-0 flex-auto">
                    <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">{a.title}<Badge tone={tone} className="text-[10.5px]">{a.kind}</Badge></span>
                    <span className="block text-[12.5px] text-slate-500">{a.detail}</span>
                  </span>
                </>
              );
              return <li key={a.id} className="border-b border-soft last:border-0">{a.href ? <Link href={a.href} className="flex gap-3 px-4 py-3 hover:bg-subtle sm:px-5">{body}</Link> : <div className="flex gap-3 px-4 py-3 sm:px-5">{body}</div>}</li>;
            })}
          </ul>
        ) : <div className="border-t border-line p-5"><EmptyState compact title="No issues found">No duplicates, overpayments, date problems or missing due dates.</EmptyState></div>}
      </SectionCard>

      {pv && (
        <RepayDialog p={pv} targets={repayTargets(pv, data.cards)} account={account}
          onClose={() => setOpenId(null)} onSaved={(t) => { setOpenId(null); setFlash(t); }} />
      )}
    </Shell>
  );
}

function DueList({ title, id, items, empty, onOpen, cards, tone, today }: {
  title: string; id: string; items: OpenItem[]; empty: string; onOpen: (id: string) => void; cards: FinanceData["cards"]; tone: "bad" | "owed"; today: string;
}) {
  return (
    <SectionCard labelledBy={id}>
      <SectionHead id={id} title={title} sub={items.length ? `${items.length} item${items.length === 1 ? "" : "s"} · ৳${Math.round(sumBy(items, (o) => o.left)).toLocaleString("en-IN")}` : undefined} />
      {items.length ? (
        <ul className="m-0 max-h-[400px] list-none overflow-y-auto border-t border-line p-0">
          {items.map((o) => (
            <li key={o.key}>
              <button type="button" onClick={() => onOpen(o.personId)} className="flex w-full items-center gap-3 border-b border-soft px-4 py-2.5 text-left hover:bg-subtle sm:px-5">
                <DateChip iso={o.iso} today={today} size="sm" />
                <Avatar text={initials(o.name)} size={26} />
                <span className="min-w-0 flex-auto"><span className="block truncate text-[13.5px] font-medium">{o.name}</span>
                  <span className="text-[12px] text-slate-500">{o.source === "loan" ? "Bank loan" : cardLabel(cards.find((c) => c.id === o.cardId))}{o.emi ? " · EMI" : ""}</span></span>
                <Money value={o.left} tone={tone} />
              </button>
            </li>
          ))}
        </ul>
      ) : <div className="border-t border-line p-4"><EmptyState compact title={empty} /></div>}
    </SectionCard>
  );
}
