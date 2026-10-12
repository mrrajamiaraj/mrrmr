import { STATUS_PILL, DUE_PILL, type DueKind } from "@/lib/ledger";
import type { Status } from "@/lib/types";

export function Avatar({ text, size = 42, me = false }: { text: string; size?: number; me?: boolean }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size <= 30 ? 11.5 : size >= 50 ? 18 : 15 }}
      className={`inline-flex flex-none items-center justify-center rounded-full font-bold ${
        me ? "bg-[#E2E8F0] text-slate-800" : "bg-[#CCFBF1] text-[#115E59]"
      }`}
    >
      {text}
    </span>
  );
}

export function StatusPill({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12.5px] font-semibold ${STATUS_PILL[status]} ${className}`}>
      {status}
    </span>
  );
}

export function DuePill({ kind, children }: { kind: DueKind; children: React.ReactNode }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-[13px] font-semibold ${DUE_PILL[kind]}`}>{children}</span>;
}

export function Tag({ children, white = false }: { children: React.ReactNode; white?: boolean }) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-[13px] ${white ? "border border-[#E2E8F0] bg-white" : "bg-soft"}`}>#{children}</span>
  );
}

/** Underlined name button that opens a profile, used in tables. */
export function PersonButton({ name, initials, onClick, size = 28 }: { name: string; initials: string; onClick: () => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2.5 p-0 text-left text-[14.5px] font-semibold text-ink underline decoration-[#99F6E4] underline-offset-4"
    >
      <Avatar text={initials} size={size} />
      {name}
    </button>
  );
}

export function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`overflow-hidden rounded-2xl border border-line bg-white ${className}`}>{children}</section>;
}

export function SectionHead({ id, title, sub, action }: { id: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-[18px]">
      <div>
        <h2 id={id} className="m-0 text-[19px] font-bold uppercase">{title}</h2>
        {sub && <div className="text-sm text-slate-500">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export const th = "px-4 py-3 font-semibold";
export const td = "px-4 py-3";
export const theadRow = "border-y border-line bg-[#F8FAFC] text-left";

export function Flash({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div role="status" className="rounded-xl border border-[#A7F3D0] bg-[#D1FAE5] px-4 py-3 text-[14.5px] font-medium text-[#065F46]">
      {text}
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-7 text-center text-slate-500">{children}</div>;
}
