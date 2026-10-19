import { STATUS_PILL, DUE_PILL, type DueKind } from "@/lib/ledger";
import type { Status } from "@/lib/types";

export function Avatar({ text, size = 42, me = false }: { text: string; size?: number; me?: boolean }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size <= 30 ? 11 : size >= 50 ? 17 : 13.5 }}
      className={`inline-flex flex-none items-center justify-center rounded-full font-medium ${
        me ? "bg-[#E3E1DA] text-slate-700" : "bg-[#E9EEEA] text-[#1F4D3A]"
      }`}
    >
      {text}
    </span>
  );
}

/** Status as a coloured dot and a word, not a filled badge. */
export function StatusPill({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium ${STATUS_PILL[status]} ${className}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function DuePill({ kind, children }: { kind: DueKind; children: React.ReactNode }) {
  return <span className={`whitespace-nowrap text-[13px] ${DUE_PILL[kind]}`}>{children}</span>;
}

export function Tag({ children, white = false }: { children: React.ReactNode; white?: boolean }) {
  return (
    <span className={`rounded px-1.5 py-px text-[12.5px] text-slate-600 ${white ? "border border-line bg-white" : "bg-soft"}`}>{children}</span>
  );
}

/** Name button that opens a profile, used in tables. */
export function PersonButton({ name, initials, onClick, size = 28 }: { name: string; initials: string; onClick: () => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex min-h-10 items-center gap-2.5 p-0 text-left text-[14px] font-medium text-ink"
    >
      <Avatar text={initials} size={size} />
      <span className="decoration-[#A8A49A] underline-offset-4 group-hover:underline">{name}</span>
    </button>
  );
}

export function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`overflow-hidden rounded-lg border border-line bg-white ${className}`}>{children}</section>;
}

export function SectionHead({ id, title, sub, action }: { id: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-4">
      <div>
        <h2 id={id} className="m-0 text-[16px] font-semibold">{title}</h2>
        {sub && <div className="mt-0.5 text-[13px] text-slate-500">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export const th = "px-4 py-2 text-[12.5px] font-medium text-slate-500";
export const td = "px-4 py-2.5";
export const theadRow = "border-y border-line bg-[#FAF9F6] text-left";
export const totalRow = "border-t border-[#D6D3CB] bg-[#FAF9F6] font-medium";

export function Flash({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div role="status" className="rounded-md border-l-2 border-brand-2 bg-white px-4 py-2.5 text-[14px] text-ink shadow-[0_0_0_1px_#E3E1DA]">
      {text}
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-[#D6D3CB] px-6 py-8 text-center text-[14px] text-slate-500">{children}</div>;
}
