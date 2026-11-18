import { dateLong, dateShort, monthLabel, taka, takaExact } from "@/lib/format";
import { subMoney } from "@/lib/money";
import { DueIcon } from "@/components/icons";
import type { PendingInstallment, PlanStatus } from "@/lib/ledger";

const hth = "whitespace-nowrap px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500";

const STATE_TEXT: Record<State, string> = { paid: "paid", partial: "partly paid", late: "late", next: "due next", upcoming: "upcoming" };

/**
 * Installment timeline: one segment per month, left to right. Paid = jade, partly paid = jade fill over the track,
 * late = red, due next = outlined. Each segment is a list item with its full status for screen readers; the visible
 * month labels thin out on long plans so they never collide.
 */
function Timeline({ plan: p, nextIdx, today }: { plan: PlanStatus; nextIdx: number; today: string }) {
  const step = p.of <= 12 ? 1 : p.of <= 24 ? 3 : 6;
  return (
    <ol aria-label="Installment timeline" className="m-0 grid list-none gap-1 p-0" style={{ gridTemplateColumns: `repeat(${p.installments.length}, minmax(0, 1fr))` }}>
      {p.installments.map((s, i) => {
        const state = stateOf(s, i === nextIdx, today);
        const paidPct = s.amount ? Math.round(((s.amount - s.left) / s.amount) * 100) : 100;
        const month = monthLabel(s.iso.slice(0, 7)).split(" ")[0];
        return (
          <li key={s.n} className="flex min-w-0 flex-col items-center gap-1" title={`${s.n}. ${dateLong(s.iso)}: ${taka(s.amount)}, ${STATE_TEXT[state]}`}>
            <span className={`relative h-2 w-full overflow-hidden rounded-full ${
              state === "paid" ? "bg-brand-2" : state === "late" ? "bg-bad" : state === "next" ? "bg-line ring-2 ring-brand-2 ring-offset-1 ring-offset-subtle" : "bg-line"
            }`}>
              {state === "partial" && <span className="absolute inset-y-0 left-0 bg-brand-2" style={{ width: `${paidPct}%` }} />}
            </span>
            <span className="sr-only">Installment {s.n} of {p.of}, {dateLong(s.iso)}, {taka(s.amount)}: {STATE_TEXT[state]}</span>
            <span aria-hidden="true" className={`text-[10.5px] ${i % step === 0 || i === p.installments.length - 1 ? "" : "invisible"} ${state === "late" ? "font-semibold text-bad" : i === nextIdx ? "font-semibold text-ink" : "text-slate-500"}`}>
              {month}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

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
      return <span className="text-owed">Partly paid{s.paidOn ? ` · ${dateShort(s.paidOn)}` : ""}</span>;
    case "late":
      return <span className="inline-flex items-center gap-1 font-medium text-bad"><DueIcon size={13} />Late{s.left < s.amount ? " · partly paid" : ""}</span>;
    case "next":
      return <span className="font-medium text-slate-800">Due next</span>;
    default:
      return <span className="text-slate-500">Upcoming</span>;
  }
}

function Term({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="m-0 truncate">{value}</dd></div>;
}

/** A card-statement style schedule for one EMI: contract terms, progress timeline, and every month's installment. */
export function OneSchedule({ plan: p, today, who }: { plan: PlanStatus; today: string; who?: string }) {
  const paidAmt = subMoney(p.amount, p.left);
  const lastAmt = p.installments.length ? p.installments[p.installments.length - 1].amount : p.perMonth;
  const lastDiff = p.of > 1 && lastAmt !== p.perMonth;
  const pct = p.amount ? Math.min(Math.round((paidAmt / p.amount) * 100), 100) : 0;
  const nextIdx = p.installments.findIndex((s) => s.left > 0);
  const lateCount = p.installments.filter((s) => s.left > 0 && s.iso < today).length;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-col gap-2.5 bg-subtle px-3.5 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <div className="truncate font-semibold">{who ? `${who} · ` : ""}{p.reason}</div>
            <div className="text-[12.5px] text-slate-500">Bought {dateLong(p.usedOn)} · {p.of} monthly installments</div>
          </div>
          <div className="text-right">
            <div className={`money text-[17px] ${p.left > 0 ? "text-owed" : "text-brand-2"}`}>{p.left > 0 ? `${taka(p.left)} left` : "Paid off"}</div>
            <div className="text-[12px] text-slate-500">{p.paidCount} of {p.of} paid · {p.of - p.paidCount} remaining</div>
          </div>
        </div>
        {/* The contract terms, all from recorded data: nothing assumed about interest. */}
        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-line bg-surface p-2.5 text-[12.5px] sm:grid-cols-4">
          <Term label="Principal" value={<span className="money">{taka(p.principal)}</span>} />
          <Term label="Charges" value={p.charges ? <span className="money">{taka(p.charges)}</span> : <span className="text-slate-500">None recorded</span>} />
          <Term label="Total payable" value={<span className="money font-semibold">{taka(p.amount)}</span>} />
          <Term label="Monthly" value={<span className="money">{takaExact(p.perMonth)}{lastDiff ? <span className="font-normal text-slate-500"> · last {takaExact(lastAmt)}</span> : null}</span>} />
        </dl>
        {lastDiff && (
          <p className="m-0 text-[11.5px] text-slate-500">
            {taka(p.amount)} ÷ {p.of} doesn't divide evenly to the paisa, so each installment is rounded down to {takaExact(p.perMonth)} and the last one is {takaExact(lastAmt)}.
          </p>
        )}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-auto"><Timeline plan={p} nextIdx={nextIdx} today={today} /></div>
          <span className="money -mt-4 flex-none text-[12.5px] text-slate-600">{pct}% paid</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] text-slate-600">
          <span>Paid <span className="money text-brand-2">{taka(paidAmt)}</span></span>
          {p.next && (
            <span>
              Next <span className="money text-slate-800">{taka(p.next.left)}</span> {p.next.iso < today ? "was due" : "on"} {dateLong(p.next.iso)}
            </span>
          )}
          {lateCount > 0 && <span className="font-medium text-bad">{lateCount} late</span>}
          {p.last && <span>Last installment {dateLong(p.last)}</span>}
          {p.left > 0 && p.paidCount < p.of - 1 && (
            <span>Settle early: a repayment of <span className="money text-slate-800">{taka(p.left)}</span> clears every remaining installment</span>
          )}
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
                  <td data-label="Amount" className="money whitespace-nowrap px-3 py-1.5 text-right">{takaExact(s.amount)}</td>
                  <td data-label="Status" className="whitespace-nowrap px-3 py-1.5"><StateLabel s={s} state={state} /></td>
                  <td data-label="Left" className={`money whitespace-nowrap px-3 py-1.5 text-right ${s.left > 0 ? "text-owed" : "text-slate-400"}`}>
                    {s.left > 0 ? takaExact(s.left) : "—"}
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
