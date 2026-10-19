"use client";

import { useRef, useState } from "react";
import { Avatar, EmptyNote, StatusPill } from "@/components/debtors/bits";
import { useViewer } from "@/components/shell";
import { ChevronLeft, ChevronRight, CloseIcon, PeopleIcon, SearchIcon } from "@/components/icons";
import { dateShort, taka } from "@/lib/format";
import type { Status } from "@/lib/types";

export type SlideItem = {
  id: string;
  name: string;
  initials: string;
  status: Status;
  txCount: number;
  lastIso: string | null;
  took: number;
  paid: number;
  owes: number;
  pct: number;
  reasons: string[];
};

const STEP = 294; // card width 280 + gap 14

export function ProfileSlider({
  title,
  sub,
  tookLabel = "TOOK",
  items,
  onOpen,
  onAdd,
}: {
  title: string;
  sub: string;
  tookLabel?: string;
  items: SlideItem[];
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const viewer = useViewer();
  const track = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const shown = !ql ? items : items.filter((p) => p.name.toLowerCase().includes(ql) || p.reasons.join(" ").toLowerCase().includes(ql));

  const slide = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * STEP * Math.max(1, Math.floor(el.clientWidth / STEP)), behavior: "smooth" });
  };

  return (
    <section aria-labelledby="prof-h" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 id="prof-h" className="m-0 flex items-center gap-2.5 text-xl font-bold">
            <PeopleIcon size={20} className="text-brand-2" />
            {title}
          </h2>
          <div className="text-sm text-slate-500">{sub}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!searchOpen ? (
            <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search debtors"
              className="flex size-11 items-center justify-center rounded-[10px] border border-[#CBD5E1] bg-white">
              <SearchIcon size={18} />
            </button>
          ) : (
            <label className="flex min-h-11 w-[min(320px,100%)] items-center gap-2 rounded-[10px] border-2 border-[#14B8A6] bg-white pl-3 pr-1.5">
              <SearchIcon size={16} className="text-brand-2" />
              <span className="sr-only">Search debtors</span>
              <input type="search" autoFocus value={q}
                onChange={(e) => { setQ(e.target.value); if (track.current) track.current.scrollLeft = 0; }}
                placeholder="Search name or reason…" className="min-w-0 flex-auto bg-transparent text-[15px] outline-none" />
              <button type="button" onClick={() => { setSearchOpen(false); setQ(""); }} aria-label="Close search"
                className="flex size-9 flex-none items-center justify-center text-slate-600">
                <CloseIcon size={16} />
              </button>
            </label>
          )}
          <button type="button" onClick={() => slide(-1)} aria-label="Previous debtors"
            className="flex size-11 items-center justify-center rounded-full border border-[#CBD5E1] bg-white">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => slide(1)} aria-label="Next debtors"
            className="flex size-11 items-center justify-center rounded-full bg-brand text-white">
            <ChevronRight size={18} />
          </button>
          {!viewer && (
            <button type="button" onClick={onAdd} className="min-h-11 rounded-[10px] bg-brand px-4 text-[15px] font-semibold text-white">
              + Add Debtor
            </button>
          )}
        </div>
      </div>

      {ql && (
        <div className="text-sm text-slate-600">
          {shown.length} {shown.length === 1 ? "debtor matches" : "debtors match"} “{q.trim()}”
        </div>
      )}

      <div ref={track} role="region" aria-label="Debtor profiles, scroll sideways" tabIndex={0}
        className="-mx-0.5 flex snap-x snap-mandatory gap-3.5 overflow-x-auto scroll-smooth px-0.5 pb-3.5 pt-1">
        {shown.map((p) => (
          <article key={p.id} className="flex flex-[0_0_280px] snap-start flex-col gap-3 rounded-2xl border border-line bg-white p-4">
            <div className="flex items-center gap-3">
              <Avatar text={p.initials} />
              <div className="min-w-0 flex-auto">
                <div className="truncate text-base font-bold">{p.name}</div>
                <div className="text-[13px] text-slate-500">{p.txCount} records · last {dateShort(p.lastIso, "—")}</div>
              </div>
              <StatusPill status={p.status} />
            </div>
            <div className="grid grid-cols-3 rounded-[10px] bg-[#F8FAFC] py-2 text-center">
              <div><div className="text-[11.5px] tracking-[0.06em] text-slate-500">{tookLabel}</div><div className="money text-sm">{taka(p.took)}</div></div>
              <div><div className="text-[11.5px] tracking-[0.06em] text-slate-500">PAID</div><div className="money text-sm text-brand-2">{taka(p.paid)}</div></div>
              <div><div className="text-[11.5px] tracking-[0.06em] text-[#B45309]">OWES</div><div className="money text-sm text-[#92400E]">{taka(p.owes)}</div></div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-[3px] bg-soft"><div className="h-full bg-[#14B8A6]" style={{ width: `${Math.min(p.pct, 100)}%` }} /></div>
            <button type="button" onClick={() => onOpen(p.id)}
              className="min-h-11 rounded-[10px] border border-[#99F6E4] bg-[#F0FDFA] text-[14.5px] font-semibold text-brand-2">
              Open profile →
            </button>
          </article>
        ))}
      </div>

      {ql && shown.length === 0 && <EmptyNote>No debtor matches “{q.trim()}”.</EmptyNote>}
      {!ql && items.length === 0 && <EmptyNote>{viewer ? "No debtors yet." : "No debtors yet. Use “+ Add Debtor” to record the first one."}</EmptyNote>}
    </section>
  );
}
