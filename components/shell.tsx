"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdminButton } from "@/components/admin-button";
import { CommandPalette, PaletteProvider } from "@/components/command-palette";
import { Modal } from "@/components/modal";
import { Wordmark } from "@/components/brand";
import { setTheme, ThemeSegment, ThemeToggle } from "@/components/theme";
import { Indicator, useSlidingIndicator } from "@/components/motion";
import { ArrowUpIcon, BankIcon, CardIcon, DownloadIcon, EyeIcon, FlaskIcon, LogoutIcon, PeopleIcon, SearchIcon } from "@/components/icons";
import { exitViewMode } from "@/app/view/actions";
import { signOut } from "@/app/login/actions";
import { CARD_NAMES } from "@/lib/ledger";

type AdminInfo = { email: string; lastChanged: string; viewer: boolean };
const AdminContext = createContext<AdminInfo>({ email: "", lastChanged: "—", viewer: false });

export function AdminProvider({ value, children }: { value: AdminInfo; children: React.ReactNode }) {
  return <AdminContext.Provider value={value}><PaletteProvider>{children}</PaletteProvider></AdminContext.Provider>;
}

/** True in view mode: hide every button that adds, edits or deletes. The database refuses writes anyway. */
export function useViewer() {
  return useContext(AdminContext).viewer;
}

/** `label` is the page title, `nav` fits the desktop header, `short` the phone tab bar. `key` is the second key of each "G then …" shortcut. */
export const TABS = [
  { href: "/account", label: "Bank Account", nav: "Bank Account", short: "Bank", key: "b", icon: BankIcon },
  { href: "/debtors", label: "Debtors & Loans", nav: "Debtors & Loans", short: "Debtors", key: "d", icon: PeopleIcon },
  { href: "/cards/1", label: CARD_NAMES[1], nav: "City Bank Card", short: "Card 1", key: "1", icon: CardIcon },
  { href: "/cards/2", label: CARD_NAMES[2], nav: "Community Card", short: "Card 2", key: "2", icon: CardIcon },
  { href: "/research", label: "Research Finance", nav: "Research", short: "Research", key: "r", icon: FlaskIcon },
];

/** The sections this user may open: view mode sees Research Finance only (the proxy enforces it). */
export function useTabs() {
  return useViewer() ? TABS.filter((t) => t.href === "/research") : TABS;
}

// Side padding grows with the screen, and never less than a landscape iPhone's notch.
const pad = "pl-[max(clamp(16px,4vw,40px),env(safe-area-inset-left))] pr-[max(clamp(16px,4vw,40px),env(safe-area-inset-right))]";
const ghostBtn = "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 text-[13.5px] text-slate-700 hover:border-line-strong hover:bg-soft sm:px-3";

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
  const tabs = useTabs();
  const path = usePathname();
  const active = tabs.find((t) => path.startsWith(t.href))?.href;
  const router = useRouter();
  const { ref, box } = useSlidingIndicator<HTMLElement>(active);
  const [scrolled, setScrolled] = useState(false);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const goPending = useRef(0);
  const showHelp = useCallback(() => setHelp(true), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ⌘K / Ctrl+K anywhere, or "/" when not typing, opens the command palette.
  // "G" then a section key jumps there (G B, G D, G 1, G 2, G R); "?" lists every shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPalette((o) => !o);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (e.key === "?") { e.preventDefault(); setHelp(true); return; }
      if (goPending.current && performance.now() - goPending.current < 1200) {
        goPending.current = 0;
        const tab = tabs.find((t) => t.key === k);
        if (tab) { e.preventDefault(); router.push(tab.href); }
        return;
      }
      if (k === "g") goPending.current = performance.now();
      if (k === "t") {
        const dark = document.documentElement.dataset.theme === "dark";
        setTheme(dark ? "light" : "dark", { x: innerWidth - 60, y: 28 });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, tabs]);

  // Spotlight: any `.spot` surface gets a soft glow that follows the pointer (CSS reads --mx / --my).
  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(".spot");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <>
      <header
        style={{ viewTransitionName: "site-header" }}
        className={`sticky top-0 z-40 border-b bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur-md backdrop-saturate-150 transition-[border-color,box-shadow] duration-200 ${pad} ${
          scrolled ? "border-line shadow-[0_6px_20px_-14px_rgba(28,27,24,0.3)]" : "border-line"
        }`}
      >
        {/* Phones: logo and buttons on one row; the sections live in the bottom tab bar. */}
        <div className="mx-auto flex max-w-[1200px] items-center gap-x-6">
          <Link href={tabs[0].href} aria-label="RMR Finance, home" className="group flex flex-none items-center py-3 text-[15px]">
            <Wordmark compact />
          </Link>
          {/* Phones use the tab bar at the bottom of the screen instead (MobileNav). */}
          <nav ref={ref} aria-label="Sections"
            className="relative -mb-px hidden min-w-0 flex-auto gap-1 overflow-x-auto [scrollbar-width:none] md:flex">
            {tabs.map((t) => {
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
                  {/* Laptops and up get the header names; tablets the short ones. */}
                  <span className="hidden xl:inline">{t.nav}</span>
                  <span className="xl:hidden">{t.short}</span>
                  <PendingBar />
                </Link>
              );
            })}
            <Indicator box={box} />
          </nav>
          <div className="ml-auto flex flex-none items-center gap-1.5 sm:gap-2">
            <button type="button" onClick={() => setPalette(true)} aria-label="Search and jump (Ctrl+K)"
              className={`${ghostBtn} text-slate-500 2xl:min-w-[150px] 2xl:justify-between`}>
              <span className="inline-flex items-center gap-1.5"><SearchIcon size={14} /><span className="hidden lg:inline">Jump to…</span></span>
              <kbd className="hidden rounded border border-line bg-soft px-1.5 font-sans text-[11px] text-slate-500 2xl:inline">Ctrl K</kbd>
            </button>
            {/* Phones reach Export from search (Ctrl K / the magnifier) to keep this row to four buttons. */}
            {!admin.viewer && (
              <a href="/export" download aria-label="Export CSV" title="Export CSV" className="hidden min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[13.5px] text-slate-600 hover:bg-soft hover:text-ink sm:inline-flex">
                <DownloadIcon size={15} />
                <span className="sr-only">Export</span>
              </a>
            )}
            <ThemeToggle />
            {admin.viewer ? (
              <form action={exitViewMode}>
                <button type="submit" aria-label="Log out" title="Log out" className={ghostBtn}>
                  <LogoutIcon size={15} />
                  <span className="hidden sm:inline">Log out</span>
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
      {palette && <CommandPalette viewer={admin.viewer} onClose={() => setPalette(false)} onShortcuts={showHelp} />}
      {help && <ShortcutsDialog tabs={tabs} onClose={() => setHelp(false)} />}
      <MobileNav tabs={tabs} active={active} />
      <BackToTop />
    </>
  );
}

/** Phones: the sections as a thumb-reach tab bar fixed to the bottom edge. */
function MobileNav({ tabs, active }: { tabs: typeof TABS; active?: string }) {
  return (
    <nav aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md backdrop-saturate-150 md:hidden">
      <div className="mx-auto flex max-w-[560px]">
        {tabs.map((t) => {
          const on = t.href === active;
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
              className={`relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-[11px] ${on ? "font-medium text-ink" : "text-slate-500"}`}>
              <span className={`grid h-7 w-12 place-items-center rounded-full transition-[background-color,scale] duration-300 ease-[var(--ease-spring)] ${on ? "scale-100 bg-good-tint-2 text-brand-ink" : "scale-90"}`}>
                <Icon size={19} />
              </span>
              {t.short}
              <PendingBar />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ShortcutsDialog({ tabs, onClose }: { tabs: typeof TABS; onClose: () => void }) {
  const SHORTCUTS: [string[], string][] = [
    [["Ctrl", "K"], "Search pages, people and actions"],
    [["/"], "Open search"],
    ...tabs.map((t): [string[], string] => [["G", t.key.toUpperCase()], `Go to ${t.label}`]),
    [["T"], "Switch day / night mode"],
    [["←", "→"], "Move between months in a chart"],
    [["Esc"], "Close a dialog"],
    [["?"], "Show this list"],
  ];
  return (
    <Modal title="Shortcuts & appearance" onClose={onClose} maxWidth={460}>
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
        <span className="text-[14px] font-medium">Theme</span>
        <div className="w-[min(240px,60%)]"><ThemeSegment /></div>
      </div>
      <ul className="m-0 flex list-none flex-col p-2">
        {SHORTCUTS.map(([keys, what]) => (
          <li key={what} className="flex min-h-11 items-center justify-between gap-4 rounded-lg px-3 text-[14px] hover:bg-subtle">
            <span className="text-slate-700">{what}</span>
            <span className="flex flex-none items-center gap-1">
              {keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && <span className="text-[11px] text-slate-400">{keys[0] === "G" ? "then" : ""}</span>}
                  <kbd className="min-w-7 rounded-md border border-line border-b-line-strong bg-surface px-1.5 py-0.5 text-center font-sans text-[12px] font-medium text-slate-600 shadow-[0_1px_0_#D6D3CB]">{k}</kbd>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
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
      className={`fixed bottom-[calc(74px+env(safe-area-inset-bottom))] right-4 z-30 grid md:bottom-5 md:right-5 size-11 place-items-center rounded-full border border-line bg-surface text-slate-600 shadow-[var(--shadow-lift)] hover:text-ink ${
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
    <main className={`${pad} pb-[calc(96px+env(safe-area-inset-bottom))] pt-6 sm:pt-8 md:pb-20`}>
      {/* Keyed by route so each page plays its entrance, including Card 1 → Card 2 which reuses the same component. */}
      <div key={path} className="page-enter mx-auto flex max-w-[1200px] flex-col gap-5 sm:gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 max-w-[760px] items-start gap-3.5">
            {Icon && (
              <span aria-hidden="true" className="mt-0.5 hidden size-11 flex-none place-items-center rounded-xl border border-good-line bg-gradient-to-b from-good-tint to-good-tint-2 text-brand-ink sm:grid">
                <Icon size={21} />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="m-0 flex flex-wrap items-center gap-2.5 text-[22px] font-semibold leading-tight tracking-[-0.02em] sm:text-[26px]">
                {tab?.label ?? "Finance"}
                {admin.viewer && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[11.5px] font-medium tracking-normal text-slate-600">
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
          ? "bg-brand text-white shadow-[0_1px_2px_rgba(28,27,24,0.2),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-brand-hover hover:shadow-[0_6px_16px_-6px_rgba(31,77,58,0.55)]"
          : "border border-line-strong bg-surface text-ink shadow-[var(--shadow-card)] hover:border-slate-400 hover:bg-subtle"
      }`}
    >
      {children}
    </button>
  );
}
