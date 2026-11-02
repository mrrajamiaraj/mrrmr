import { dateLong, dateShort, monthLabel, taka } from "@/lib/format";
import type { PendingInstallment, PlanStatus } from "@/lib/ledger";

const hth = "whitespace-nowrap px-3 py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-slate-500";

type State = "paid" | "partial" | "late" | "next" | "upcoming";

function stateOf(s: PendingInstallment, isNext: boolean, today: string): State {
  if (s.left <= 0) return "paid";
  if (s.iso < today) return "late";
  if (s.left < s.amount) return "partial";
  return isNext ? "next" : "upcoming";
}

function StateLabel({ s, state }: { s: PendingInstallment; state: State }) {
  switch (state) {
    case "paid":
      return <span className="font-medium text-brand-2">Paid{s.paidOn ? ` · ${dateShort(s.paidOn)}` : ""}</span>;
    case "partial":
      return <span className="text-[#85570F]">Partly paid{s.paidOn ? ` · ${dateShort(s.paidOn)}` : ""}</span>;
    case "late":
      return <span className="font-medium text-[#9B3426]">Late{s.left < s.amount ? " · partly paid" : ""}</span>;
    case "next":
      return <span className="font-medium text-slate-800">Due next</span>;
    default:
      return <span className="text-slate-500">Upcoming</span>;
  }
}

/** A card-statement style schedule for one EMI: summary, progress, and every month's installment. */
function OneSchedule({ plan: p, today }: { plan: PlanStatus; today: string }) {
  const paidAmt = p.amount - p.left;
  const pct = p.amount ? Math.min(Math.round((paidAmt / p.amount) * 100), 100) : 0;
  const nextIdx = p.installments.findIndex((s) => s.left > 0);
  const lateCount = p.installments.filter((s) => s.left > 0 && s.iso < today).length;

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="flex flex-col gap-2.5 bg-subtle px-3.5 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.reason}</div>
            <div className="text-[12.5px] text-slate-500">
              {taka(p.amount)} on {dateLong(p.usedOn)} · {p.of} months × {taka(p.perMonth)}
            </div>
          </div>
          <div className="text-right">
            <div className={`money text-[17px] ${p.left > 0 ? "text-owed" : "text-brand-2"}`}>{p.left > 0 ? `${taka(p.left)} left` : "Paid off"}</div>
            <div className="text-[12px] text-slate-500">{p.paidCount} of {p.of} installments paid</div>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${pct}% of the EMI paid`}>
          <div className="h-full rounded-full bg-brand-2 transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] text-slate-600">
          <span>Paid <span className="money text-brand-2">{taka(paidAmt)}</span></span>
          {p.next && (
            <span>
              Next <span className="money text-slate-800">{taka(p.next.left)}</span> {p.next.iso < today ? "was due" : "on"} {dateLong(p.next.iso)}
            </span>
          )}
          {lateCount > 0 && <span className="font-medium text-[#9B3426]">{lateCount} late</span>}
          {p.last && <span>Last installment {dateLong(p.last)}</span>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="stack-table w-full min-w-[520px] border-collapse text-[13.5px]">
          <thead>
            <tr className="border-y border-line text-left">
              <th scope="col" className={hth}>#</th>
              <th scope="col" className={hth}>Month</th>
              <th scope="col" className={hth}>Due date</th>
              <th scope="col" className={`${hth} text-right`}>Amount</th>
              <th scope="col" className={hth}>Status</th>
              <th scope="col" className={`${hth} text-right`}>Left</th>
            </tr>
          </thead>
          <tbody>
            {p.installments.map((s, i) => {
              const state = stateOf(s, i === nextIdx, today);
              return (
                <tr key={s.n} className={`border-b border-soft last:border-0 ${state === "next" ? "bg-good-tint/40" : ""}`}>
                  <td className="px-3 py-1.5 text-slate-500">{s.n}</td>
                  <th scope="row" data-label="Month" className="whitespace-nowrap px-3 py-1.5 text-left font-medium">{monthLabel(s.iso.slice(0, 7))}</th>
                  <td data-label="Due date" className="whitespace-nowrap px-3 py-1.5 text-slate-600">{dateLong(s.iso)}</td>
                  <td data-label="Amount" className="money whitespace-nowrap px-3 py-1.5 text-right">{taka(s.amount)}</td>
                  <td data-label="Status" className="whitespace-nowrap px-3 py-1.5"><StateLabel s={s} state={state} /></td>
                  <td data-label="Left" className={`money whitespace-nowrap px-3 py-1.5 text-right ${s.left > 0 ? "text-owed" : "text-slate-400"}`}>
                    {s.left > 0 ? taka(s.left) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EmiSchedules({ plans, today }: { plans: PlanStatus[]; today: string }) {
  const emis = plans.filter((p) => p.plan === "emi").sort((a, b) => a.usedOn.localeCompare(b.usedOn));
  if (!emis.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-[14.5px] font-semibold">EMI schedule</h3>
      <p className="m-0 -mt-1 text-[12.5px] text-slate-500">Repayments clear the oldest installment first.</p>
      {emis.map((p) => <OneSchedule key={p.useId} plan={p} today={today} />)}
    </div>
  );
}
