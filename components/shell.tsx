"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { AdminButton } from "@/components/admin-button";
import { CommandPalette } from "@/components/command-palette";
import { Indicator, useSlidingIndicator } from "@/components/motion";
import { ArrowUpIcon, BankIcon, CardIcon, DownloadIcon, EyeIcon, FlaskIcon, LogoutIcon, PeopleIcon, SearchIcon } from "@/components/icons";
import { exitViewMode } from "@/app/view/actions";
import { signOut } from "@/app/login/actions";
import { CARD_NAMES } from "@/lib/ledger";

type AdminInfo = { email: string; lastChanged: string; viewer: boolean };
const AdminContext = createContext<AdminInfo>({ email: "", lastChanged: "—", viewer: false });

export function AdminProvider({ value, children }: { value: AdminInfo; children: React.ReactNode }) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

/** True in view mode: hide every button that adds, edits or deletes. The database refuses writes anyway. */
export function useViewer() {
  return useContext(AdminContext).viewer;
}

export const TABS = [
  { href: "/account", label: "Bank Account", short: "Bank", icon: BankIcon },
  { href: "/debtors", label: "Debtors & Loans", short: "Debtors", icon: PeopleIcon },
  { href: "/cards/1", label: CARD_NAMES[1], short: "Card 1", icon: CardIcon },
  { href: "/cards/2", label: CARD_NAMES[2], short: "Card 2", icon: CardIcon },
  { href: "/research", label: "Research Finance", short: "Research", icon: FlaskIcon },
];

const pad = "px-[clamp(16px,4vw,40px)]";
const ghostBtn = "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-white px-2.5 text-[13.5px] text-slate-700 hover:border-[#D6D3CB] hover:bg-soft sm:px-3";

/** Thin bar across the top of the window while a clicked tab's page is still loading. */
function PendingBar() {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-brand-2 transition-[scale,opacity] ${
        pending ? "scale-x-[0.85] opacity-100 delay-100 duration-[2400ms] ease-out" : "scale-x-0 opacity-0 duration-200"
      }`} />
  );
}

/** Sticky app header: logo, section tabs with a sliding underline, search, export and account buttons. Mounted once in the layout. */
export function TopBar() {
  const admin = useContext(AdminContext);
  const path = usePathname();
  const active = TABS.find((t) => path.startsWith(t.href))?.href;
  const { ref, box } = useSlidingIndicator<HTMLElement>(active);
  const [scrolled, setScrolled] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ⌘K / Ctrl+K anywhere, or "/" when not typing, opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPalette((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header
        style={{ viewTransitionName: "site-header" }}
        className={`sticky top-0 z-40 border-b bg-white/85 backdrop-blur-md backdrop-saturate-150 transition-[border-color,box-shadow] duration-200 ${pad} ${
          scrolled ? "border-line shadow-[0_6px_20px_-14px_rgba(28,27,24,0.3)]" : "border-line"
        }`}
      >
        {/* Phones: logo and buttons on one row, the section tabs scroll sideways on a row below. */}
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 md:flex-nowrap">
          <Link href="/account" className="group flex flex-none items-center gap-2 py-3 text-[15px] font-semibold text-ink">
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-brand text-[13px] font-semibold text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)] transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-rotate-6 group-hover:scale-105">
              L
            </span>
            <span>Ledger<span className="text-brand-2">.</span></span>
          </Link>
          <nav ref={ref} aria-label="Sections"
            className="relative order-last -mx-[clamp(16px,4vw,40px)] -mb-px flex w-[calc(100%_+_2*clamp(16px,4vw,40px))] gap-1 overflow-x-auto border-t border-soft px-[clamp(16px,4vw,40px)] [scrollbar-width:none] md:order-none md:mx-0 md:w-auto md:min-w-0 md:flex-auto md:border-t-0 md:px-0">
            {TABS.map((t) => {
              const on = t.href === active;
              const Icon = t.icon;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={`group/tab relative isolate flex items-center gap-1.5 whitespace-nowrap px-2 py-3.5 text-[13.5px] ${
                    on ? "font-medium text-ink" : "text-slate-500 hover:text-ink"
                  }`}
                >
                  <span aria-hidden="true" className="absolute inset-x-0 inset-y-2 -z-10 rounded-md bg-soft opacity-0 transition-opacity group-hover/tab:opacity-100" />
                  <Icon size={15} className={on ? "text-brand-2" : "text-slate-400 group-hover/tab:text-slate-600"} />
                  {t.label}
                  <PendingBar />
                </Link>
              );
            })}
            <Indicator box={box} />
          </nav>
          <div className="ml-auto flex flex-none items-center gap-2">
            <button type="button" onClick={() => setPalette(true)} aria-label="Search and jump (Ctrl+K)"
              className={`${ghostBtn} text-slate-500 lg:min-w-[150px] lg:justify-between`}>
              <span className="inline-flex items-center gap-1.5"><SearchIcon size={14} /><span className="hidden lg:inline">Jump to…</span></span>
              <kbd className="hidden rounded border border-line bg-soft px-1.5 font-sans text-[11px] text-slate-500 lg:inline">Ctrl K</kbd>
            </button>
            <a href="/export" download aria-label="Export CSV" title="Export CSV" className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[13.5px] text-slate-600 hover:bg-soft hover:text-ink">
              <DownloadIcon size={15} />
              <span className="hidden xl:inline">Export</span>
            </a>
            {admin.viewer ? (
              <form action={exitViewMode}>
                <button type="submit" className={ghostBtn}>
                  <LogoutIcon size={15} />
                  Log out
                </button>
              </form>
            ) : (
              <>
                <AdminButton email={admin.email} lastChanged={admin.lastChanged} />
                <form action={signOut}>
                  <button type="submit" aria-label="Log out" title="Log out" className={ghostBtn}>
                    <LogoutIcon size={15} />
                    <span className="hidden sm:inline">Log out</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </header>
      {palette && <CommandPalette viewer={admin.viewer} onClose={() => setPalette(false)} />}
      <BackToTop />
    </>
  );
}

function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 900);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button type="button" aria-label="Back to top" tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-5 right-5 z-30 grid size-11 place-items-center rounded-full border border-line bg-white text-slate-600 shadow-[var(--shadow-lift)] hover:text-ink ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      } duration-300`}>
      <ArrowUpIcon size={18} />
    </button>
  );
}

/** The page title, its one-line description and the page's buttons, then the page itself. */
export function Shell({
  subtitle,
  actions,
  children,
}: {
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const admin = useContext(AdminContext);
  const path = usePathname();
  const tab = TABS.find((t) => path.startsWith(t.href));
  const Icon = tab?.icon;

  return (
    <main className={`${pad} pb-16 pt-6 sm:pb-20 sm:pt-8`}>
      {/* Keyed by route so each page plays its entrance, including Card 1 → Card 2 which reuses the same component. */}
      <div key={path} className="page-enter mx-auto flex max-w-[1200px] flex-col gap-5 sm:gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 max-w-[760px] items-start gap-3.5">
            {Icon && (
              <span aria-hidden="true" className="mt-0.5 hidden size-11 flex-none place-items-center rounded-xl border border-[#CADBD0] bg-gradient-to-b from-[#F2F6F3] to-[#E6EFE9] text-brand sm:grid">
                <Icon size={21} />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="m-0 flex flex-wrap items-center gap-2.5 text-[22px] font-semibold leading-tight tracking-[-0.02em] sm:text-[26px]">
                {tab?.label ?? "Finance"}
                {admin.viewer && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2 py-0.5 text-[11.5px] font-medium tracking-normal text-slate-600">
                    <EyeIcon size={12} />
                    View only
                  </span>
                )}
              </h1>
              <p className="m-0 mt-1 text-[14px] text-slate-500">{subtitle}</p>
            </div>
          </div>
          {!admin.viewer && actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
        </div>
        {children}
      </div>
    </main>
  );
}

/** Page-level button next to the title: solid for the main action, outlined for the rest. */
export function HeaderButton({
  onClick,
  children,
  variant = "green",
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "green" | "outline";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 flex-auto items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-medium sm:flex-none ${
        variant === "green"
          ? "bg-brand text-white shadow-[0_1px_2px_rgba(28,27,24,0.2),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-[#173D2E] hover:shadow-[0_6px_16px_-6px_rgba(31,77,58,0.55)]"
          : "border border-[#D6D3CB] bg-white text-ink shadow-[var(--shadow-card)] hover:border-[#A8A49A] hover:bg-[#FAF9F6]"
      }`}
    >
      {children}
    </button>
  );
}
