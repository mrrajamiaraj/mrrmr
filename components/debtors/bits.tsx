"use client";

import { useEffect } from "react";
import { STATUS_PILL, DUE_PILL, type DueKind } from "@/lib/ledger";
import { toast } from "@/components/toast";
import { EmptyState } from "@/components/ui";
import { DueIcon } from "@/components/icons";
import type { Status } from "@/lib/types";

// Muted tints so people are easy to tell apart at a glance; picked from the initials, so a person keeps their colour.
const AVATAR_TINTS = [
  "bg-[#E9EEEA] text-brand-ink dark:bg-[#1C2E25]",
  "bg-[#E8EDF4] text-[#2F4A6E] dark:bg-[#1C2534] dark:text-[#9DB8DE]",
  "bg-owed-tint text-[#7A5418] dark:text-[#E3B873]",
  "bg-[#F1E7E9] text-[#7C3445] dark:bg-[#2E1C21] dark:text-[#E59CAE]",
  "bg-[#ECE9F3] text-[#4A3F78] dark:bg-[#232036] dark:text-[#B8AEE8]",
  "bg-[#E4EFEF] text-[#285E5E] dark:bg-[#172A2A] dark:text-[#86CACA]",
];
const tint = (s: string) => AVATAR_TINTS[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_TINTS.length];

export function Avatar({ text, size = 42, me = false }: { text: string; size?: number; me?: boolean }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size <= 30 ? 11 : size >= 50 ? 17 : 13.5 }}
      className={`inline-flex flex-none select-none items-center justify-center rounded-full font-semibold ring-2 ring-surface ${
        me ? "bg-line text-slate-700" : tint(text)
      }`}
    >
      {text}
    </span>
  );
}

const STATUS_BG: Record<Status, string> = {
  Pending: "bg-bad-tint",
  "Partially Paid": "bg-owed-tint",
  Repaid: "bg-good-tint",
};

/** Status as a soft pill with a coloured dot. The word carries the meaning; colour only reinforces it. */
export function StatusPill({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-2 py-0.5 text-[12px] font-medium leading-5 ${STATUS_PILL[status]} ${STATUS_BG[status]} ${className}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

/** Due date. A late one is marked with an icon and a "Late" word, not colour alone. */
export function DuePill({ kind, children }: { kind: DueKind; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[13px] ${DUE_PILL[kind]}`}>
      {kind === "late" && <DueIcon size={13} />}
      {children}
    </span>
  );
}

export function Tag({ children, white = false }: { children: React.ReactNode; white?: boolean }) {
  return (
    <span className={`rounded px-1.5 py-px text-[12.5px] text-slate-600 ${white ? "border border-line bg-surface" : "bg-soft"}`}>{children}</span>
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
      <span className="transition-transform duration-200 ease-[var(--ease-spring)] group-hover:scale-110"><Avatar text={initials} size={size} /></span>
      <span className="decoration-slate-400 underline-offset-4 group-hover:text-brand-ink group-hover:underline">{name}</span>
    </button>
  );
}

/** Design-system card for a page section (tables, lists). Labelled by its SectionHead when one is used. */
export function SectionCard({ children, className = "", labelledBy }: { children: React.ReactNode; className?: string; labelledBy?: string }) {
  return <section aria-labelledby={labelledBy} className={`spot surface-card overflow-hidden ${className}`}>{children}</section>;
}

export function SectionHead({ id, title, sub, action }: { id: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3.5 pt-4 sm:px-5 sm:pt-5">
      <div className="min-w-0">
        <h2 id={id} className="m-0 text-heading font-semibold tracking-[-0.01em]">{title}</h2>
        {sub && <div className="mt-1 text-small text-slate-500">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

// Transaction-table recipes: hairline rows, quiet uppercase headers, tabular figures (set globally on tables).
export const th = "px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500";
export const td = "px-4 py-3";
export const theadRow = "border-y border-line bg-subtle text-left";
export const totalRow = "border-t border-line-strong bg-subtle font-medium";

/** Confirms a save. Shows as a toast; renders nothing in place, so pages can keep it wherever they like. */
export function Flash({ text }: { text: string }) {
  useEffect(() => { if (text) toast(text); }, [text]);
  return null;
}

/** Legacy name for the design-system empty state (pages pass one line of guidance). */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <EmptyState title="Nothing here yet" compact>{children}</EmptyState>;
}
