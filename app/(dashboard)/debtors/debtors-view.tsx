"use client";

import { useMemo, useState, useTransition } from "react";
import { Shell, HeaderButton } from "@/components/shell";
import { HistoryIcon, PencilIcon, PeopleIcon, PersonIcon, PlusIcon, SearchIcon, TrashIcon, WalletIcon } from "@/components/icons";
import { AddDebtorDialog } from "@/components/debtors/add-debtor-dialog";
import { ProfileModal } from "@/components/debtors/profile-modal";
import { RepayForm, repayTargets } from "@/components/debtors/repay-form";
import { Avatar, EmptyNote, Flash, SectionCard, SectionHead, StatusPill, td, th, theadRow } from "@/components/debtors/bits";
import { ErrorBox, Modal, btnGhost, btnPrimary } from "@/components/modal";
import { deletePerson, updatePerson } from "@/lib/actions";
import { amountSigned, buildProfiles, byOwesThenName, type EventKind, type Profile } from "@/lib/ledger";
import { dateLong, pct, taka } from "@/lib/format";
import type { FinanceData, Status } from "@/lib/types";

type Tab = "portfolio" | "table" | "ledger";
type TypeF = "ALL" | "LENT" | "REPAID";
const STATUSES: ("All" | Status)[] = ["All", "Pending", "Partially Paid", "Repaid"];
const LEDGER_TYPE: Record<EventKind, { label: string; color: string; bg: string }> = {
  "Took loan": { label: "Money lent", color: "#B45309", bg: "#FEF3C7" },
  "Used my card": { label: "Card use", color: "#1D4ED8", bg: "#DBEAFE" },
  "Paid back": { label: "Repayment received", color: "#0F766E", bg: "#CCFBF1" },
};

type Dialog =
  | { kind: "new" }
  | { kind: "loan"; p: Profile }
  | { kind: "repay"; p: Profile }
  | { kind: "edit"; p: Profile }
  | { kind: "delete"; p: Profile }
  | null;

export function DebtorsView({ data, today }: { data: FinanceData; today: string }) {
  const [tab, setTab] = useState<Tab>("portfolio");
  const [statusF, setStatusF] = useState<"All" | Status>("All");
  const [typeF, setTypeF] = useState<TypeF>("ALL");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  const all = useMemo(() => buildProfiles(data, today).sort(byOwesThenName), [data, today]);
  const account = data.accounts[0] ? { id: data.accounts[0].id, name: data.accounts[0].name } : null;
  const ql = q.trim().toLowerCase();

  const people = all.filter(
    (p) =>
      (statusF === "All" || p.status === statusF) &&
      (!ql || `${p.name} ${p.reasons.join(" ")} ${p.notes ?? ""} ${p.relation ?? ""}`.toLowerCase().includes(ql))
  );

  const ledgerAll = all.flatMap((p) => p.events.map((e) => ({ ...e, person: p.name, personId: p.id })));
  const ledger = ledgerAll
    .filter((e) => typeF === "ALL" || (typeF === "REPAID" ? e.kind === "Paid back" : e.kind !== "Paid back"))
    .filter((e) => !ql || `${e.person} ${e.detail}`.toLowerCase().includes(ql))
    .sort((a, b) => b.iso.localeCompare(a.iso));

  const totLent = all.reduce((s, p) => s + p.taken, 0);
  const totRepaid = all.reduce((s, p) => s + p.paid, 0);
  const totOwes = all.reduce((s, p) => s + p.owes, 0);
  const pTot = people.reduce(
    (s, p) => ({ lent: s.lent + p.taken, rep: s.rep + p.paid, left: s.left + p.owes, loans: s.loans + p.loanCount + p.cardCount }),
    { lent: 0, rep: 0, left: 0, loans: 0 }
  );

  const kpis = [
    { label: "Money lent", value: taka(totLent), sub: "Loans + card use by others", glyph: "↗", line: "#6366F1", soft: "#E0E7FF", ink: "#4338CA", bg: "#FFFFFF", border: "#E5E7EB", val: "#0F172A", subC: "#64748B" },
    { label: "Repaid back", value: taka(totRepaid), sub: `${pct(totRepaid, totLent, 1)}% recovered`, glyph: "↙", line: "#14B8A6", soft: "#CCFBF1", ink: "#0F766E", bg: "#FFFFFF", border: "#E5E7EB", val: "#0F172A", subC: "#0F766E" },
    { label: "Outstanding due", value: taka(totOwes), sub: `● ${all.filter((p) => p.owes > 0).length} people still owe`, glyph: "!", line: "#F59E0B", soft: "#FEF3C7", ink: "#B45309", bg: "#FFFBEB", border: "#FDE68A", val: "#92400E", subC: "#92400E" },  ];

  const tabs: [Tab, string][] = [
    ["portfolio", "Debtor Portfolio"],
    ["table", `Receivables Table (${people.length})`],
    ["ledger", `Loan & Repayment Ledger (${ledgerAll.length})`],
  ];

  const pv = openId ? all.find((p) => p.id === openId) : undefined;
  const fresh = (p: Profile) => all.find((x) => x.id === p.id) ?? p;
  const knownNames = data.people.map((p) => p.name);
  const close = () => setDialog(null);
  const added = (personId: string | null, text: string) => { close(); setFlash(text); if (personId) setOpenId(personId); };

  return (
    <Shell
      icon={<WalletIcon />}
      subtitle="Debtor receivables, multiple loan tracking, settlement dates & repayment ledger"
      actions={
        <>
          <HeaderButton onClick={() => setDialog({ kind: "new" })}><PlusIcon size={16} />Log Loan / Repayment</HeaderButton>
          <HeaderButton variant="outline" onClick={() => setDialog({ kind: "new" })}><PersonIcon size={16} />Add Debtor</HeaderButton>
        </>
      }
    >
      <section aria-label="Loan figures" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        {kpis.map((k) => (
          <div key={k.label} className="flex flex-col gap-3 rounded-[14px] border border-b-4 p-[18px]" style={{ background: k.bg, borderColor: k.border, borderBottomColor: k.line }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-slate-700">{k.label}</span>
              <span aria-hidden="true" className="flex size-[30px] flex-none items-center justify-center rounded-lg font-bold" style={{ background: k.soft, color: k.ink }}>{k.glyph}</span>
            </div>
            <div className="money text-2xl" style={{ color: k.val }}>{k.value}</div>
            <div className="text-[13px]" style={{ color: k.subC }}>{k.sub}</div>
          </div>
        ))}
      </section>

      <section aria-label="Workspace controls" className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white px-[18px] py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Views" className="flex flex-wrap gap-2">
            {tabs.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`min-h-11 rounded-[10px] border px-4 text-[15.5px] font-semibold ${tab === key ? "border-brand bg-brand text-white" : "border-[#E2E8F0] bg-soft text-slate-800"}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="flex min-h-11 min-w-[200px] flex-[0_1_300px] items-center gap-2 rounded-[10px] border border-[#CBD5E1] px-3.5">
            <SearchIcon size={16} className="text-slate-500" />
            <span className="sr-only">Search</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search person, reason, notes…" className="min-w-0 flex-auto bg-transparent text-[15px] outline-none" />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-soft pt-3">
          <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-sm text-slate-500">Filter:</span>
            {STATUSES.map((s) => (
              <button key={s} type="button" aria-pressed={statusF === s} onClick={() => setStatusF(s)}
                className={`min-h-9 rounded-lg border px-3 text-sm font-medium ${statusF === s ? "border-[#5EEAD4] bg-[#CCFBF1] text-[#115E59]" : "border-soft bg-soft text-slate-700"}`}>
                {s === "All" ? "All Statuses" : s}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Filter ledger by type" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-sm text-slate-500">Ledger type:</span>
            {([["ALL", "ALL"], ["LENT", "Money Lent"], ["REPAID", "Repayment Received"]] as [TypeF, string][]).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={typeF === key} onClick={() => { setTypeF(key); setTab("ledger"); }}
                className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${typeF === key ? "bg-ink text-white" : "bg-soft text-slate-700"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <Flash text={flash} />

      {tab === "portfolio" && (
        <section aria-labelledby="port-h" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <h2 id="port-h" className="m-0 flex items-center gap-2.5 text-xl font-bold">
              <PeopleIcon size={20} className="text-brand-2" />
              Borrower profiles &amp; reason breakdown
            </h2>
            <button type="button" onClick={() => setDialog({ kind: "new" })} className={btnPrimary}>+ Add Debtor</button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] items-start gap-4">
            {people.map((p) => {
              const isOpen = expanded === p.id;
              const badge = [p.loanCount && `${p.loanCount} ${p.loanCount === 1 ? "Loan" : "Loans"}`, p.cardCount && `${p.cardCount} card ${p.cardCount === 1 ? "use" : "uses"}`].filter(Boolean).join(" · ") || "No records";
              return (
                <article key={p.id} className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-[18px]">
                  <div className="flex items-start gap-3">
                    <Avatar text={p.initials} />
                    <div className="min-w-0 flex-auto">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setOpenId(p.id)} className="text-left text-[17px] font-bold underline decoration-[#99F6E4] underline-offset-4">{p.name}</button>
                        <span className="rounded-md border border-[#C7D2FE] bg-[#EEF2FF] px-[7px] py-px text-xs text-[#4338CA]">{badge}</span>
                      </div>
                      <div className="text-[13.5px] text-slate-500">Due: {p.owes > 0 ? dateLong(p.due) : "—"}</div>
                    </div>
                    <StatusPill status={p.status} className="text-[13px]" />
                  </div>
                  <div className="flex flex-col gap-2 rounded-xl border border-soft bg-[#F8FAFC] px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-semibold tracking-[0.06em] text-slate-600">REASONS ({p.reasons.length})</span>
                      <button type="button" onClick={() => setExpanded(isOpen ? null : p.id)} aria-expanded={isOpen} className="min-h-8 px-1 text-[13.5px] font-semibold text-brand-2">
                        {isOpen ? "Hide history" : "Full history"}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.reasons.map((r, i) => <span key={i} className="rounded-md border border-[#E2E8F0] bg-white px-2 py-0.5 text-[13px]">#{r}</span>)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 border-y border-soft py-2.5 text-center">
                    <div><div className="text-xs tracking-[0.06em] text-slate-500">BORROWED</div><div className="money">{taka(p.taken)}</div></div>
                    <div><div className="text-xs tracking-[0.06em] text-slate-500">REPAID</div><div className="money text-brand-2">{taka(p.paid)}</div></div>
                    <div><div className="text-xs tracking-[0.06em] text-[#B45309]">LEFT</div><div className="money text-[#92400E]">{taka(p.owes)}</div></div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-sm"><span>Recovery progress</span><span className="font-mono">{pct(p.paid, p.taken, 1).toFixed(1)}%</span></div>
                    <div className="h-2 overflow-hidden rounded bg-soft"><div className="h-full bg-[#14B8A6]" style={{ width: `${Math.min(p.pct, 100)}%` }} /></div>
                  </div>
                  {isOpen && (
                    <ol className="m-0 flex list-none flex-col gap-2.5 rounded-xl bg-[#F8FAFC] p-3">
                      {p.events.map((e) => {
                        const t = LEDGER_TYPE[e.kind];
                        return (
                          <li key={e.id} className="flex items-center gap-2.5">
                            <span className="size-2.5 flex-none rounded-full" style={{ background: t.color }} />
                            <div className="min-w-0 flex-auto">
                              <div className="text-sm font-semibold">{e.kind === "Paid back" ? "Gave money back" : e.kind === "Took loan" ? "Took money" : "Used my card"}</div>
                              <div className="text-[13px] text-slate-500">{dateLong(e.iso)} · {e.detail}</div>
                            </div>
                            <div className="text-right">
                              <div className="money text-sm" style={{ color: t.color }}>{amountSigned(e.sign, e.amount)}</div>
                              <div className="text-[12.5px] text-slate-500">left {taka(e.owesAfter)}</div>
                            </div>
                          </li>
                        );
                      })}
                      {p.events.length === 0 && <li className="text-sm text-slate-500">No records yet.</li>}
                    </ol>
                  )}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setDialog({ kind: "loan", p })} className="min-h-11 rounded-[10px] border border-[#C7D2FE] bg-[#EEF2FF] px-3.5 text-[14.5px] font-semibold text-[#3730A3]">+ Loan</button>
                    <button type="button" onClick={() => setDialog({ kind: "repay", p })} disabled={p.owes <= 0} className="min-h-11 flex-auto rounded-[10px] border border-[#99F6E4] bg-[#F0FDFA] text-[14.5px] font-semibold text-brand-2">↙ Repay</button>
                    <IconBtn label="Show history" onClick={() => setExpanded(isOpen ? null : p.id)}><HistoryIcon size={18} /></IconBtn>
                    <IconBtn label="Edit debtor" onClick={() => setDialog({ kind: "edit", p })}><PencilIcon size={18} /></IconBtn>
                    <IconBtn label="Delete debtor" muted onClick={() => setDialog({ kind: "delete", p })}><TrashIcon size={18} /></IconBtn>
                  </div>
                </article>
              );
            })}
          </div>
          {people.length === 0 && <EmptyNote>{all.length ? "No borrowers match this filter." : "No debtors yet. Use “+ Add Debtor” to record the first one."}</EmptyNote>}
        </section>
      )}

      {tab === "table" && (
        <SectionCard>
          <SectionHead id="tbl-h" title="Loan receivables & debtor settlement summary"
            sub="Multiple loans per person, every borrowing reason, and what is left to collect"
            action={<button type="button" onClick={() => setDialog({ kind: "new" })} className={btnPrimary}>+ Add Debtor</button>} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-[14.5px]">
              <thead>
                <tr className={theadRow}>
                  <th scope="col" className={th}>Person name</th>
                  <th scope="col" className={th}>Records</th>
                  <th scope="col" className={`${th} text-right`}>Total borrowed</th>
                  <th scope="col" className={`${th} text-right`}>Total repaid</th>
                  <th scope="col" className={`${th} bg-[#FEFCE8] text-right text-[#92400E]`}>Balance left</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Borrowing reasons</th>
                  <th scope="col" className={th}>Next due</th>
                  <th scope="col" className={`${th} text-right`}>Repaid %</th>
                  <th scope="col" className={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-soft">
                    <th scope="row" className={`${td} text-left font-semibold`}>
                      <button type="button" onClick={() => setOpenId(p.id)} className="inline-flex items-center gap-2.5 text-left underline decoration-[#99F6E4] underline-offset-4">
                        <span className="inline-flex size-7 items-center justify-center rounded-full bg-[#CCFBF1] text-xs font-bold text-[#115E59] no-underline">{p.name[0]}</span>
                        {p.name}
                      </button>
                    </th>
                    <td className={td}><span className="rounded-md border border-[#C7D2FE] bg-[#EEF2FF] px-2 py-0.5 font-mono text-[13px] text-[#4338CA]">{p.loanCount + p.cardCount}</span></td>
                    <td className={`${td} text-right font-mono`}>{taka(p.taken)}</td>
                    <td className={`${td} text-right font-mono text-brand-2`}>{taka(p.paid)}</td>
                    <td className={`${td} money bg-[#FEFCE8] text-right text-[#78350F]`}>{taka(p.owes)}</td>
                    <td className={td}><StatusPill status={p.status} className="text-[13px]" /></td>
                    <td className={td}><span className="inline-flex flex-wrap gap-1">{p.reasons.map((r, i) => <span key={i} className="rounded-md bg-soft px-[7px] py-px text-[12.5px]">#{r}</span>)}</span></td>
                    <td className={`${td} whitespace-nowrap`}>{p.owes > 0 ? dateLong(p.due) : "—"}</td>
                    <td className={`${td} text-right font-mono`}>{pct(p.paid, p.taken, 1).toFixed(1)}%</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex gap-1.5">
                        <button type="button" onClick={() => setDialog({ kind: "loan", p })} className="min-h-9 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] px-2.5 text-[13.5px] font-semibold text-[#3730A3]">+ Loan</button>
                        <button type="button" onClick={() => setDialog({ kind: "repay", p })} disabled={p.owes <= 0} className="min-h-9 rounded-lg border border-[#99F6E4] bg-[#F0FDFA] px-2.5 text-[13.5px] font-semibold text-brand-2">Repay</button>
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line bg-[#F8FAFC]">
                  <th scope="row" className="px-4 py-3.5 text-left font-bold">TOTAL SUMMARY</th>
                  <td className="px-4 py-3.5 font-mono">{pTot.loans}</td>
                  <td className="money px-4 py-3.5 text-right">{taka(pTot.lent)}</td>
                  <td className="money px-4 py-3.5 text-right text-brand-2">{taka(pTot.rep)}</td>
                  <td className="money bg-[#FEF9C3] px-4 py-3.5 text-right text-[#78350F]">{taka(pTot.left)}</td>
                  <td className="px-4 py-3.5">—</td>
                  <td className="px-4 py-3.5 text-slate-500">Active receivables</td>
                  <td className="px-4 py-3.5">—</td>
                  <td className="money px-4 py-3.5 text-right">{pct(pTot.rep, pTot.lent, 1).toFixed(1)}%</td>
                  <td className="px-4 py-3.5">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === "ledger" && (
        <SectionCard>
          <SectionHead id="led-h" title="Loan & repayment ledger" sub="Every time someone took money from you, and every time they gave it back" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[14.5px]">
              <thead>
                <tr className={theadRow}>
                  <th scope="col" className={th}>Date</th>
                  <th scope="col" className={th}>Person</th>
                  <th scope="col" className={th}>Type</th>
                  <th scope="col" className={th}>Reason / method</th>
                  <th scope="col" className={`${th} text-right`}>Amount</th>
                  <th scope="col" className={`${th} text-right`}>Their balance after</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e) => {
                  const t = LEDGER_TYPE[e.kind];
                  return (
                    <tr key={e.id} className="border-b border-soft">
                      <td className={`${td} whitespace-nowrap text-slate-600`}>{dateLong(e.iso)}</td>
                      <td className={`${td} font-semibold`}>
                        <button type="button" onClick={() => setOpenId(e.personId)} className="text-left underline decoration-[#99F6E4] underline-offset-4">{e.person}</button>
                      </td>
                      <td className={td}><span className="rounded-full px-2.5 py-[3px] text-[13px] font-semibold" style={{ background: t.bg, color: t.color }}>{t.label}</span></td>
                      <td className={`${td} text-slate-600`}>{e.detail}</td>
                      <td className={`${td} money text-right`} style={{ color: t.color }}>{amountSigned(e.sign, e.amount)}</td>
                      <td className={`${td} text-right font-mono`}>{taka(e.owesAfter)}</td>
                    </tr>
                  );
                })}
                {ledger.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Nothing matches.</td></tr>}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {dialog?.kind === "new" && (
        <AddDebtorDialog mode="loan" extended title="Add debtor" submitLabel="Add debtor" account={account} knownNames={knownNames} onClose={close} onAdded={added} />
      )}
      {dialog?.kind === "loan" && (
        <AddDebtorDialog mode="loan" extended title="Add another loan" submitLabel="Add loan" account={account} knownNames={knownNames}
          lockedPerson={{ name: dialog.p.name, initials: dialog.p.initials, owes: fresh(dialog.p).owes }} onClose={close} onAdded={added} />
      )}
      {dialog?.kind === "repay" && (
        <Modal title="Record repayment" onClose={close} maxWidth={620}>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-2.5 rounded-[10px] border border-[#99F6E4] bg-[#F0FDFA] px-3.5 py-2.5">
              <Avatar text={dialog.p.initials} size={32} />
              <div><div className="font-semibold">{dialog.p.name}</div><div className="text-[13px] text-slate-600">Currently owes {taka(fresh(dialog.p).owes)}</div></div>
            </div>
            {fresh(dialog.p).owes > 0 ? (
              <RepayForm key={fresh(dialog.p).owes} personId={dialog.p.id} first={dialog.p.first} targets={repayTargets(fresh(dialog.p), data.cards)}
                mode="all" account={account} withDate onSaved={(text) => { close(); setFlash(text); }} />
            ) : (
              <div className="text-sm text-slate-600">{dialog.p.first} has paid everything back.</div>
            )}
          </div>
        </Modal>
      )}
      {dialog?.kind === "edit" && <EditPersonDialog p={dialog.p} onClose={close} />}
      {dialog?.kind === "delete" && <DeletePersonDialog p={dialog.p} onClose={close} onDone={(t) => { close(); setFlash(t); }} />}

      {pv && (
        <ProfileModal
          profile={pv}
          variant="all"
          cards={data.cards}
          account={account}
          onClose={() => setOpenId(null)}
          onMore={() => { setOpenId(null); setDialog({ kind: "loan", p: pv }); }}
          onSaved={setFlash}
        />
      )}
    </Shell>
  );
}

function IconBtn({ label, onClick, muted = false, children }: { label: string; onClick: () => void; muted?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={`flex size-11 items-center justify-center rounded-[10px] hover:bg-soft ${muted ? "text-slate-400" : "text-slate-600"}`}>
      {children}
    </button>
  );
}

function EditPersonDialog({ p, onClose }: { p: Profile; onClose: () => void }) {
  const [f, setF] = useState({ name: p.name, relation: p.relation ?? "", phone: p.phone ?? "", notes: p.notes ?? "" });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setError(""); };

  return (
    <Modal title={`Edit ${p.name}`} onClose={onClose} maxWidth={520}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={pending} className={btnPrimary}
          onClick={() => start(async () => { const r = await updatePerson(p.id, f); if (r.error) setError(r.error); else onClose(); })}>
          {pending ? "Saving…" : "Save"}
        </button>
      </>}>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <label className="field-label sm:col-span-2">Name *<input className="field-input" value={f.name} onChange={set("name")} /></label>
        <label className="field-label">Relation<input className="field-input" value={f.relation} onChange={set("relation")} placeholder="e.g. Friend, sister" /></label>
        <label className="field-label">Phone<input className="field-input" value={f.phone} onChange={set("phone")} inputMode="tel" /></label>
        <label className="field-label sm:col-span-2">Notes<input className="field-input" value={f.notes} onChange={set("notes")} /></label>
        {error && <ErrorBox className="sm:col-span-2">{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

function DeletePersonDialog({ p, onClose, onDone }: { p: Profile; onClose: () => void; onDone: (t: string) => void }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const hasRecords = p.txCount > 0;

  return (
    <Modal title={`Delete ${p.name}?`} onClose={onClose} maxWidth={480}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>{hasRecords ? "Close" : "Cancel"}</button>
        {!hasRecords && (
          <button type="button" disabled={pending} className="min-h-11 rounded-[10px] bg-[#B91C1C] px-5 text-[15px] font-semibold text-white"
            onClick={() => start(async () => { const r = await deletePerson(p.id); if (r.error) setError(r.error); else onDone(`${p.name} was deleted.`); })}>
            {pending ? "Deleting…" : "Delete"}
          </button>
        )}
      </>}>
      <div className="flex flex-col gap-3 p-5 text-[15px]">
        {hasRecords ? (
          <p className="m-0">{p.name} has {p.txCount} records (loans, card uses or repayments). To keep your history correct, people with records can&apos;t be deleted.</p>
        ) : (
          <p className="m-0">{p.name} has no records. This permanently removes them from your list.</p>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}
