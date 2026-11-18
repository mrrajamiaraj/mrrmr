"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTabs } from "@/components/shell";
import { Avatar } from "@/components/debtors/bits";
import { ArrowRightIcon, CommandIcon, DownloadIcon, LogoutIcon, MonitorIcon, MoonIcon, SearchIcon, SunIcon } from "@/components/icons";
import { setTheme, useTheme } from "@/components/theme";
import { exitViewMode } from "@/app/view/actions";
import { signOut } from "@/app/login/actions";
import { taka } from "@/lib/format";

type Item = { id: string; group: string; label: string; hint?: string; icon: React.ReactNode; run: () => void };

type PalettePerson = { id: string; name: string; initials: string; owes: number };
type PaletteCtx = { people: PalettePerson[]; setPeople: (p: PalettePerson[]) => void; openRef: React.RefObject<(id: string) => void> };
const PeopleContext = createContext<PaletteCtx>({ people: [], setPeople: () => {}, openRef: { current: () => {} } });

/** Holds the people the current page has registered, so the palette (in the header) can open their profiles. */
export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [people, setPeople] = useState<PalettePerson[]>([]);
  const openRef = useRef<(id: string) => void>(() => {});
  const value = useMemo(() => ({ people, setPeople, openRef }), [people]);
  return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>;
}

/** A page calls this with its people and how to open one; the palette then lists them under "People". */
export function usePalettePeople(people: PalettePerson[], open: (id: string) => void) {
  const { setPeople, openRef } = useContext(PeopleContext);
  const sig = people.map((p) => `${p.id}:${p.owes}`).join("|");
  useEffect(() => { openRef.current = open; });
  useEffect(() => {
    setPeople(people);
    return () => setPeople([]);
    // Re-register only when the list itself changes, not on every render's fresh array.
  }, [sig]);
}

/** Ctrl/⌘ K: jump to any section, open a person, or run a workspace action from the keyboard. */
export function CommandPalette({ viewer, onClose, onShortcuts }: { viewer: boolean; onClose: () => void; onShortcuts: () => void }) {
  const router = useRouter();
  const path = usePathname();
  const { people, openRef } = useContext(PeopleContext);
  const { mode } = useTheme();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [, start] = useTransition();
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const tabs = useTabs();

  const items = useMemo<Item[]>(() => [
    ...tabs.map((t) => {
      const Icon = t.icon;
      return {
        id: t.href, group: "Go to", label: t.label, hint: path.startsWith(t.href) ? "Current" : `G ${t.key.toUpperCase()}`,
        icon: <Icon size={16} />, run: () => router.push(t.href),
      };
    }),
    ...people.map((p) => ({
      id: `person-${p.id}`, group: "People", label: p.name, hint: p.owes > 0 ? `owes ${taka(p.owes)}` : "all paid",
      icon: <Avatar text={p.initials} size={26} />, run: () => openRef.current(p.id),
    })),
    ...(viewer ? [] : [{
      id: "export", group: "Actions", label: "Export everything as CSV", icon: <DownloadIcon size={16} />,
      run: () => { window.location.href = "/export"; },
    }]),
    {
      id: "theme", group: "Actions", label: mode === "dark" ? "Switch to light mode" : "Switch to dark (night) mode",
      icon: mode === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />,
      run: () => setTheme(mode === "dark" ? "light" : "dark", { x: innerWidth / 2, y: innerHeight * 0.2 }),
    },
    {
      id: "theme-auto", group: "Actions", label: "Match my device's theme", icon: <MonitorIcon size={16} />,
      run: () => setTheme("system", { x: innerWidth / 2, y: innerHeight * 0.2 }),
    },
    {
      id: "shortcuts", group: "Actions", label: "Keyboard shortcuts", hint: "?", icon: <CommandIcon size={16} />,
      run: onShortcuts,
    },
    {
      id: "logout", group: "Actions", label: viewer ? "Leave view mode" : "Log out", icon: <LogoutIcon size={16} />,
      run: () => start(() => (viewer ? exitViewMode() : signOut())),
    },
  ], [tabs, path, router, viewer, people, openRef, onShortcuts, mode]);

  const ql = q.trim().toLowerCase();
  // Every typed word must appear somewhere in the label, in any order: "card city" finds "City Bank Credit Card".
  // With nothing typed, the People group shows only the first few so pages and actions stay in view.
  let peopleLeft = 4;
  const shown = ql
    ? items.filter((i) => ql.split(/\s+/).every((w) => `${i.label} ${i.group}`.toLowerCase().includes(w)))
    : items.filter((i) => i.group !== "People" || peopleLeft-- > 0);
  const active = Math.min(sel, Math.max(shown.length - 1, 0));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (i: Item | undefined) => { if (!i) return; onClose(); i.run(); };

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((active + 1) % Math.max(shown.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((active - 1 + shown.length) % Math.max(shown.length, 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(shown[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  let lastGroup = "";
  return (
    <div data-float className="fixed inset-0 z-[80] flex items-start justify-center bg-[rgba(10,13,19,0.45)] px-4 pt-[12vh] backdrop-blur-[2px] animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Jump to" onKeyDown={onKey}
        className="w-full max-w-[560px] overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-pop)] animate-pop-in">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <SearchIcon size={17} className="text-slate-400" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
            placeholder={people.length ? "Search pages, people and actions…" : "Search pages and actions…"} aria-label="Search pages, people and actions"
            role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            className="min-h-14 min-w-0 flex-auto bg-transparent text-[15px] outline-none placeholder:text-slate-400" />
          <kbd className="rounded border border-line bg-soft px-1.5 py-0.5 text-[11px] text-slate-500">Esc</kbd>
        </div>
        <ul ref={listRef} id={listId} role="listbox" className="m-0 max-h-[min(380px,60vh)] list-none overflow-y-auto p-2">
          {shown.map((i, n) => {
            const header = i.group !== lastGroup ? (lastGroup = i.group) : null;
            const on = n === active;
            return (
              <li key={i.id} role="presentation">
                {header && <div className="px-2.5 pb-1 pt-2 text-[11.5px] font-medium uppercase tracking-wide text-slate-400">{header}</div>}
                <div id={`${listId}-${n}`} role="option" aria-selected={on} data-index={n}
                  onMouseMove={() => setSel(n)} onClick={() => choose(i)}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-[14px] ${on ? "bg-soft text-ink" : "text-slate-700"}`}>
                  <span className={`grid size-8 flex-none place-items-center rounded-md border ${on ? "border-good-line bg-good-tint text-brand-ink" : "border-line bg-surface text-slate-500"}`}>{i.icon}</span>
                  <span className="min-w-0 flex-auto truncate">{i.label}</span>
                  {i.hint && <span className="text-[12px] text-slate-400">{i.hint}</span>}
                  <ArrowRightIcon size={14} className={`text-slate-400 transition-[opacity,translate] ${on ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0"}`} />
                </div>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-3 py-8 text-center text-[14px] text-slate-500">Nothing matches “{q.trim()}”.</li>}
        </ul>
        <div className="flex items-center gap-4 border-t border-line bg-subtle px-4 py-2 text-[12px] text-slate-500">
          <span><kbd className="font-sans">↑↓</kbd> to move</span>
          <span><kbd className="font-sans">Enter</kbd> to open</span>
          <span className="ml-auto hidden sm:inline">Press <kbd className="font-sans">?</kbd> for all shortcuts</span>
        </div>
      </div>
    </div>
  );
}
