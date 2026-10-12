"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { PersonIcon, PlusIcon, ShieldIcon, TrendIcon, WalletIcon } from "@/components/icons";
import { Avatar, Flash, StatusPill } from "@/components/debtors/bits";
import { ProfileModal } from "@/components/debtors/profile-modal";
import { buildProfiles, byOwesThenName, cardTitle } from "@/lib/ledger";
import { dateShort, monthLabel, pct, taka } from "@/lib/format";
import type { FinanceData } from "@/lib/types";

const CARD_BG: Record<number, string> = { 1: "#134E4A", 2: "#0F172A" };

export function OverviewView({ data, today }: { data: FinanceData; today: string }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [flash, setFlash] = useState("");
  const profiles = useMemo(() => buildProfiles(data, today).sort(byOwesThenName), [data, today]);

  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;
  const cash = data.accounts.reduce((s, a) => s + a.balance, 0);
  const lent = profiles.reduce((s, p) => s + p.taken, 0);
  const repaid = profiles.reduce((s, p) => s + p.paid, 0);
  const owed = profiles.reduce((s, p) => s + p.owes, 0);
  const owing = profiles.filter((p) => p.owes > 0);
  const cardDue = data.cards.reduce((s, c) => s + c.balance, 0);
  const thisMonth = today.slice(0, 7);
  const myCardThisMonth = data.cardUses
    .filter((u) => !u.person_id && u.used_on.startsWith(thisMonth))
    .reduce((s, u) => s + u.amount, 0);

  // Monthly summary built from real records: money going out to people vs coming back.
  const months = useMemo(() => {
    const m = new Map<string, { lent: number; others: number; mine: number; rec: number }>();
    const get = (iso: string) => {
      const k = iso.slice(0, 7);
      if (!m.has(k)) m.set(k, { lent: 0, others: 0, mine: 0, rec: 0 });
      return m.get(k)!;
    };
    get(today); // always show the current month
    data.loans.forEach((l) => (get(l.taken_on).lent += l.amount));
    data.cardUses.forEach((u) => (u.person_id ? (get(u.used_on).others += u.amount) : (get(u.used_on).mine += u.amount)));
    data.repayments.forEach((r) => (get(r.paid_on).rec += r.amount));
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([k, v]) => {
        const out = v.lent + v.others;
        const net = v.rec - out;
        const rate = out ? Math.round((v.rec / out) * 1000) / 10 : null;
        const note =
          net >= 0 && v.rec > 0 ? ["Net recovered", "#D1FAE5", "#065F46"]
          : rate != null && rate >= 50 ? ["On track", "#DBEAFE", "#1D4ED8"]
          : out > 0 ? ["Lent more than recovered", "#FEF3C7", "#92400E"]
          : ["Quiet month", "#F1F5F9", "#334155"];
        return { key: k, label: k === thisMonth ? `${monthLabel(k)} (so far)` : monthLabel(k), ...v, net, rate, note };
      });
  }, [data, today, thisMonth]);

  const kpis = [
    { label: "Wallet balance", value: taka(cash), sub: `● ${data.accounts.map((a) => a.name).join(", ") || "No account yet"}`, glyph: "৳", line: "#10B981", soft: "#D1FAE5", ink: "#047857", bg: "#FFFFFF", border: "#E5E7EB", val: "#0F172A", subC: "#047857" },
    { label: "Money lent", value: taka(lent), sub: "Loans + card use by others", glyph: "↗", line: "#6366F1", soft: "#E0E7FF", ink: "#4338CA", bg: "#FFFFFF", border: "#E5E7EB", val: "#0F172A", subC: "#64748B" },
    { label: "Repaid back", value: taka(repaid), sub: `${pct(repaid, lent, 1)}% recovered`, glyph: "↙", line: "#14B8A6", soft: "#CCFBF1", ink: "#0F766E", bg: "#FFFFFF", border: "#E5E7EB", val: "#0F172A", subC: "#0F766E" },
    { label: "Outstanding due", value: taka(owed), sub: "● Remaining money owed", glyph: "!", line: "#F59E0B", soft: "#FEF3C7", ink: "#B45309", bg: "#FFFBEB", border: "#FDE68A", val: "#92400E", subC: "#92400E" },
    { label: "Card dues", value: taka(cardDue), sub: `${data.cards.length} card${data.cards.length === 1 ? "" : "s"} · owed to the banks`, glyph: "▭", line: "#3B82F6", soft: "#DBEAFE", ink: "#1D4ED8", bg: "#FFFFFF", border: "#E5E7EB", val: "#0F172A", subC: "#64748B" },
    { label: "My card spending", value: taka(myCardThisMonth), sub: "Recorded this month", glyph: "↓", line: "#F43F5E", soft: "#FFE4E6", ink: "#BE123C", bg: "#FFF5F6", border: "#FECDD3", val: "#9F1239", subC: "#BE123C" },
  ];

  const pv = openId ? profiles.find((p) => p.id === openId) : undefined;
  const h2 = "m-0 text-[17px] font-bold";
  const more = "inline-flex min-h-11 items-center text-sm font-semibold text-brand-2";

  return (
    <Shell
      icon={<WalletIcon />}
      subtitle="Accounts, debtor receivables, loan tracking, credit cards & monthly ledger"
      actions={
        <>
          <Link href="/debtors" className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#10B981] px-4 text-[15px] font-semibold text-[#04241B]">
            <PlusIcon size={16} />Log Loan / Repayment
          </Link>
          <Link href="/account" className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-[#5EEAD4] bg-brand-3 px-4 text-[15px] font-semibold text-white">
            <PersonIcon size={16} />Add Debtor
          </Link>
        </>
      }
    >
      <section aria-label="Key figures" className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
        {kpis.map((k) => (
          <div key={k.label} className="flex flex-col gap-3 rounded-[14px] border border-b-4 p-[18px]" style={{ background: k.bg, borderColor: k.border, borderBottomColor: k.line }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-slate-700">{k.label}</span>
              <span aria-hidden="true" className="flex size-[30px] flex-none items-center justify-center rounded-lg text-[15px] font-bold" style={{ background: k.soft, color: k.ink }}>{k.glyph}</span>
            </div>
            <div className="money text-2xl" style={{ color: k.val }}>{k.value}</div>
            <div className="text-[13px]" style={{ color: k.subC }}>{k.sub}</div>
          </div>
        ))}
      </section>

      <section aria-label="Net position" className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#A7F3D0] bg-[#ECFDF7] px-5 py-[18px]">
        <div className="flex size-[46px] flex-none items-center justify-center rounded-xl bg-brand-2 text-white"><ShieldIcon /></div>
        <div className="flex-[1_1_260px]">
          <div className="text-[15px] font-bold uppercase tracking-[0.05em] text-[#134E4A]">Net personal financial position</div>
          <div className="text-[15px] text-slate-700">Cash in all accounts + all pending money owed to you</div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <div className="rounded-xl border border-line bg-white px-4 py-2.5">
            <div className="text-[13px] text-slate-500">Active debtors</div>
            <div className="money text-base">{owing.length} borrowers</div>
          </div>
          <div className="rounded-xl border border-line bg-white px-4 py-2.5">
            <div className="text-[13px] text-slate-500">After card dues</div>
            <div className="money text-base">{cash + owed - cardDue < 0 ? "− " : ""}{taka(cash + owed - cardDue)}</div>
          </div>
          <div className="rounded-xl bg-brand px-[18px] py-2.5 text-white">
            <div className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-mint">Net position</div>
            <div className="money text-xl">{taka(cash + owed)}</div>
          </div>
        </div>
      </section>

      <Flash text={flash} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] items-start gap-4">
        <section aria-labelledby="ov-debt" className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-line px-[18px] py-4">
            <h2 id="ov-debt" className={h2}>Who owes me right now</h2>
            <Link href="/debtors" className={more}>Open debtors →</Link>
          </div>
          {owing.slice(0, 8).map((d) => (
            <button key={d.id} type="button" onClick={() => setOpenId(d.id)}
              className="flex w-full items-center gap-3 border-b border-soft px-[18px] py-3 text-left hover:bg-[#F8FAFC]">
              <Avatar text={d.initials} size={36} />
              <div className="min-w-0 flex-auto">
                <div className="font-semibold">{d.name}</div>
                <div className="text-[13px] text-slate-500">Due {dateShort(d.due)}</div>
              </div>
              <StatusPill status={d.status} />
              <div className="money w-[92px] text-right">{taka(d.owes)}</div>
            </button>
          ))}
          {owing.length === 0 && <div className="px-[18px] py-6 text-center text-slate-500">Nobody owes you anything right now.</div>}
          {owing.length > 8 && <div className="px-[18px] py-3 text-sm text-slate-500">+ {owing.length - 8} more on the Debtors page</div>}
        </section>

        <div className="flex flex-col gap-4">
          <section aria-labelledby="ov-card" className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-line px-[18px] py-4">
              <h2 id="ov-card" className={h2}>Credit cards</h2>
              <Link href="/cards/1" className={more}>Open cards →</Link>
            </div>
            {data.cards.map((c) => {
              const util = c.credit_limit ? Math.min(100, Math.round((c.balance / c.credit_limit) * 100)) : 0;
              return (
                <Link key={c.id} href={`/cards/${c.slot}`} className="flex flex-col gap-2 border-b border-soft px-[18px] py-3.5 hover:bg-[#F8FAFC]">
                  <div className="flex items-center gap-3">
                    <div className="box-border flex h-[30px] w-[46px] flex-none items-end justify-end rounded-md px-[5px] py-[3px] font-mono text-[10px] text-white" style={{ background: CARD_BG[c.slot] }}>{c.last4 ?? ""}</div>
                    <div className="min-w-0 flex-auto">
                      <div className="font-semibold">Card {c.slot} · {cardTitle(c)}</div>
                      <div className="text-[13px] text-slate-500">Pay by {dateShort(c.pay_by)}{c.credit_limit ? ` · ${util}% of limit used` : ""}</div>
                    </div>
                    <div className="money text-[#BE123C]">{taka(c.balance)}</div>
                  </div>
                  {c.credit_limit ? <div className="h-1.5 overflow-hidden rounded-[3px] bg-soft"><div className="h-full bg-[#F43F5E]" style={{ width: `${util}%` }} /></div> : null}
                </Link>
              );
            })}
            {data.cards.length < 2 && (
              <div className="px-[18px] py-4 text-sm text-slate-500">
                {[1, 2].filter((s) => !data.cards.some((c) => c.slot === s)).map((s) => (
                  <Link key={s} href={`/cards/${s}`} className="mr-3 font-semibold text-brand-2">Set up Credit Card {s} →</Link>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="ov-acc" className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-line px-[18px] py-4">
              <h2 id="ov-acc" className={h2}>Bank account</h2>
              <Link href="/account" className={more}>Open account →</Link>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5 px-[18px] py-3.5">
              {data.accounts.map((a) => (
                <div key={a.id} className="rounded-[10px] bg-[#F8FAFC] px-3 py-2.5">
                  <div className="text-[13px] text-slate-500">{a.name}{a.holder_name ? ` · ${a.holder_name}` : ""}</div>
                  <div className="money text-[15px]">{taka(a.balance)}</div>
                </div>
              ))}
              {data.accounts.length === 0 && <Link href="/account" className="text-sm font-semibold text-brand-2">Set up your bank account →</Link>}
            </div>
          </section>
        </div>
      </div>

      <section aria-labelledby="ov-month" className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-[18px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ov-month" className="m-0 flex items-center gap-2.5 text-lg font-bold">
            <TrendIcon size={20} className="text-brand-2" />
            Monthly performance &amp; recoveries summary
          </h2>
          <span className="text-[13.5px] text-slate-500">Net = recovered − (lent + others&apos; card use)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[14.5px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="p-3 font-semibold">Month</th>
                <th scope="col" className="p-3 text-right font-semibold">Money lent</th>
                <th scope="col" className="p-3 text-right font-semibold">Others&apos; card use</th>
                <th scope="col" className="p-3 text-right font-semibold">My card spending</th>
                <th scope="col" className="p-3 text-right font-semibold">Recovered</th>
                <th scope="col" className="p-3 text-right font-semibold">Net recovered</th>
                <th scope="col" className="p-3 text-right font-semibold">Recovery rate</th>
                <th scope="col" className="p-3 font-semibold">Status note</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key} className="border-b border-soft">
                  <td className="p-3 font-medium">{m.label}</td>
                  <td className="p-3 text-right font-mono text-[#B45309]">{taka(m.lent)}</td>
                  <td className="p-3 text-right font-mono text-[#1D4ED8]">{taka(m.others)}</td>
                  <td className="p-3 text-right font-mono text-[#BE123C]">{taka(m.mine)}</td>
                  <td className="p-3 text-right font-mono text-brand-2">{taka(m.rec)}</td>
                  <td className="money p-3 text-right">{m.net < 0 ? "− " : "+ "}{taka(m.net)}</td>
                  <td className="p-3 text-right font-mono">{m.rate == null ? "—" : `${m.rate.toFixed(1)}%`}</td>
                  <td className="p-3">
                    <span className="rounded-md px-2.5 py-[3px] text-[13px] font-semibold" style={{ background: m.note[1], color: m.note[2] }}>{m.note[0]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {pv && (
        <ProfileModal
          profile={pv}
          variant="all"
          cards={data.cards}
          account={account}
          onClose={() => setOpenId(null)}
          onMore={() => router.push("/debtors")}
          onSaved={setFlash}
        />
      )}
    </Shell>
  );
}
