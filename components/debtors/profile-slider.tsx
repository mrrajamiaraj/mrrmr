"use client";

import { useRef, useState } from "react";
import { Avatar, EmptyNote, StatusPill } from "@/components/debtors/bits";
import { useViewer } from "@/components/shell";
import { ChevronLeft, ChevronRight, CloseIcon, SearchIcon } from "@/components/icons";
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

const STEP = 272; // card width 260 + gap 12
const iconBtn = "flex size-9 items-center justify-center rounded-md border border-[#D6D3CB] bg-white text-slate-600 hover:bg-soft";

export function ProfileSlider({
  title,
  sub,
  tookLabel = "Took",
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
    <section aria-labelledby="prof-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2.5">
        <div>
          <h2 id="prof-h" className="m-0 text-[16px] font-semibold">{title}</h2>
          <div className="mt-0.5 text-[13px] text-slate-500">{sub}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!searchOpen ? (
            <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search debtors" className={iconBtn}>
              <SearchIcon size={16} />
            </button>
          ) : (
            <label className="flex min-h-9 w-[min(280px,100%)] items-center gap-2 rounded-md border border-[#D6D3CB] bg-white pl-2.5 pr-1 focus-within:border-brand-2">
              <SearchIcon size={15} className="text-slate-500" />
              <span className="sr-only">Search debtors</span>
              <input type="search" autoFocus value={q}
                onChange={(e) => { setQ(e.target.value); if (track.current) track.current.scrollLeft = 0; }}
                placeholder="Name or reason" className="min-w-0 flex-auto bg-transparent text-[14px] outline-none" />
              <button type="button" onClick={() => { setSearchOpen(false); setQ(""); }} aria-label="Close search"
                className="flex size-7 flex-none items-center justify-center text-slate-500">
                <CloseIcon size={14} />
              </button>
            </label>
          )}
          <button type="button" onClick={() => slide(-1)} aria-label="Previous debtors" className={iconBtn}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => slide(1)} aria-label="Next debtors" className={iconBtn}>
            <ChevronRight size={16} />
          </button>
          {!viewer && (
            <button type="button" onClick={onAdd} className="ml-1 min-h-9 rounded-md border border-[#D6D3CB] bg-white px-3 text-[13.5px] hover:bg-soft">
              Add debtor
            </button>
          )}
        </div>
      </div>

      {ql && (
        <div className="text-[13px] text-slate-600">
          {shown.length} {shown.length === 1 ? "match" : "matches"} for “{q.trim()}”
        </div>
      )}

      <div ref={track} role="region" aria-label="Debtor profiles, scroll sideways" tabIndex={0}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2">
        {shown.map((p) => (
          <button key={p.id} type="button" onClick={() => onOpen(p.id)} aria-label={`Open ${p.name}'s profile`}
            className="flex flex-[0_0_260px] snap-start flex-col gap-3 rounded-lg border border-line bg-white p-4 text-left hover:border-[#D6D3CB] hover:shadow-[0_2px_8px_-4px_rgba(28,27,24,0.2)]">
            <div className="flex w-full items-start gap-2.5">
              <Avatar text={p.initials} size={34} />
              <div className="min-w-0 flex-auto">
                <div className="truncate text-[14.5px] font-medium">{p.name}</div>
                <div className="text-[12.5px] text-slate-500">{p.txCount} records · {dateShort(p.lastIso, "—")}</div>
              </div>
            </div>
            <dl className="m-0 grid w-full grid-cols-3 gap-2 text-[12px]">
              <div><dt className="text-slate-500">{tookLabel}</dt><dd className="money m-0 text-[13.5px]">{taka(p.took)}</dd></div>
              <div><dt className="text-slate-500">Paid</dt><dd className="money m-0 text-[13.5px]">{taka(p.paid)}</dd></div>
              <div><dt className="text-slate-500">Owes</dt><dd className="money m-0 text-[13.5px] text-[#85570F]">{taka(p.owes)}</dd></div>
            </dl>
            <div className="flex w-full items-center gap-2.5">
              <div className="h-1 flex-auto overflow-hidden rounded-full bg-[#E3E1DA]"><div className="h-full bg-brand-2" style={{ width: `${Math.min(p.pct, 100)}%` }} /></div>
              <StatusPill status={p.status} />
            </div>
          </button>
        ))}
      </div>

      {ql && shown.length === 0 && <EmptyNote>No debtor matches “{q.trim()}”.</EmptyNote>}
      {!ql && items.length === 0 && <EmptyNote>{viewer ? "No debtors yet." : "No debtors yet. Use “Add debtor” to record the first one."}</EmptyNote>}
    </section>
  );
}
