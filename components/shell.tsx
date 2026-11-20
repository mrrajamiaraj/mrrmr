"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdminButton, AdminDialog } from "@/components/admin-button";
import { CommandPalette, PaletteProvider } from "@/components/command-palette";
import { Modal } from "@/components/modal";
import { Wordmark } from "@/components/brand";
import { setTheme, ThemeSegment, ThemeToggle, THEME_NAMES, useTheme } from "@/components/theme";
import { Badge, buttonClass, Kbd, Menu, type MenuItem } from "@/components/ui";
import {
  ArrowUpIcon, CardIcon, CommandIcon, DownloadIcon, EyeIcon, FlaskIcon, HistoryIcon, HomeIcon, LockIcon, LogoutIcon, MoonIcon,
  MoreIcon, PeopleIcon, SearchIcon, SettingsIcon, ShieldIcon, SunIcon, TrendIcon,
} from "@/components/icons";
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

/**
 * The sections. `label` is the page title, `nav` the sidebar name, `short` the phone tab bar, `group` the sidebar
 * heading and page eyebrow. `key` is the second key of each "G then …" shortcut.
 */
export const TABS = [
  { href: "/account", label: "Overview", nav: "Overview", short: "Home", group: "Money", key: "b", icon: HomeIcon, primary: true },
  { href: "/debtors", label: "People", nav: "People & loans", short: "People", group: "Lending", key: "d", icon: PeopleIcon, primary: true },
  { href: "/repayments", label: "Repayments", nav: "Repayments", short: "Repay", group: "Lending", key: "p", icon: TrendIcon, primary: false },
  { href: "/cards/1", label: CARD_NAMES[1], nav: "City Bank card", short: "City", group: "Credit cards", key: "1", icon: CardIcon, primary: true },
  { href: "/cards/2", label: CARD_NAMES[2], nav: "Community Bank card", short: "Community", group: "Credit cards", key: "2", icon: CardIcon, primary: true },
  { href: "/reports", label: "Monthly summary", nav: "Monthly summary", short: "Summary", group: "Records", key: "m", icon: HistoryIcon, primary: false },
  { href: "/research", label: "Research ledger", nav: "Research ledger", short: "Research", group: "Records", key: "r", icon: FlaskIcon, primary: true },
  { href: "/settings", label: "Settings", nav: "Settings", short: "Settings", group: "Workspace", key: "s", icon: SettingsIcon, primary: false },
];
type Tab = (typeof TABS)[number];

/** The sections this user may open: view mode sees Research Finance only (the proxy enforces it). */
export function useTabs() {
  return useViewer() ? TABS.filter((t) => t.href === "/research") : TABS;
}

/** Thin bar across the top of the window while a clicked section's page is still loading. */
function PendingBar() {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-brand-2 transition-[scale,opacity] ${
        pending ? "scale-x-[0.85] opacity-100 delay-100 duration-[2400ms] ease-out" : "scale-x-0 opacity-0 duration-200"
      }`} />
  );
}

/**
 * The app chrome, mounted once in the dashboard layout:
 *  - ≥1024px: a fixed sidebar (brand, search, grouped sections, theme, export, account, sign out);
 *  - <1024px: a compact top bar (brand, search, theme, "More" menu) and a bottom tab bar for the sections.
 * Keyboard: Ctrl/⌘K or "/" search · G then B/D/1/2/R jump · T theme · ? shortcuts. Ignored while typing.
 */
export function TopBar() {
  const admin = useContext(AdminContext);
  const tabs = useTabs();
  const path = usePathname();
  const active = tabs.find((t) => path.startsWith(t.href))?.href;
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const goPending = useRef(0);
  const showHelp = useCallback(() => setHelp(true), []);
  const openPalette = useCallback(() => setPalette(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPalette((o) => !o);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role="dialog"], [role="menu"]')) return;
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
        setTheme(dark ? "light" : "dark", { x: 40, y: innerHeight - 40 });
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
      <a href="#main" className="fixed left-3 top-3 z-[80] -translate-y-20 rounded-lg bg-ink px-3 py-2 text-[14px] font-medium text-on-ink focus:translate-y-0">
        Skip to content
      </a>
      <Sidebar tabs={tabs} active={active} admin={admin} onSearch={openPalette} onHelp={showHelp} />
      <MobileHeader admin={admin} onSearch={openPalette} onHelp={showHelp} onAdmin={() => setAdminOpen(true)} />
      {palette && <CommandPalette viewer={admin.viewer} onClose={() => setPalette(false)} onShortcuts={showHelp} />}
      {help && <ShortcutsDialog tabs={tabs} onClose={() => setHelp(false)} />}
      {adminOpen && <AdminDialog email={admin.email} lastChanged={admin.lastChanged} onClose={() => setAdminOpen(false)} />}
      <MobileNav tabs={tabs} active={active} />
      <BackToTop />
    </>
  );
}

const railRow =
  "group/row relative flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-[14px] text-slate-600 hover:bg-soft hover:text-ink";

/** ≥1024px: the fixed navigation rail. */
function Sidebar({ tabs, active, admin, onSearch, onHelp }: {
  tabs: Tab[]; active?: string; admin: AdminInfo; onSearch: () => void; onHelp: () => void;
}) {
  const groups = [...new Set(tabs.map((t) => t.group))];
  return (
    <aside style={{ viewTransitionName: "site-rail" }} aria-label="App"
      className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-rail/70 backdrop-blur-xl backdrop-saturate-150 lg:flex">
      <div className="px-5 pb-4 pt-6">
        <Link href={tabs[0].href} aria-label="MRRMR, home" className="group inline-flex rounded-lg text-[15px]">
          <Wordmark size={32} tagline />
        </Link>
      </div>

      <div className="px-3">
        <button type="button" onClick={onSearch} aria-label="Search pages, people and actions (Ctrl K)"
          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-slate-500 shadow-[var(--shadow-card)] hover:border-line-strong hover:text-ink">
          <SearchIcon size={15} />
          <span className="flex-auto text-left">Search…</span>
          <Kbd>Ctrl K</Kbd>
        </button>
      </div>

      <nav aria-label="Sections" className="mt-4 flex-auto overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g} className="mt-3 first:mt-0">
            <div className="eyebrow px-3 pb-1.5 pt-2">{g}</div>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {tabs.filter((t) => t.group === g).map((t) => {
                const on = t.href === active;
                const Icon = t.icon;
                return (
                  <li key={t.href}>
                    <Link href={t.href} aria-current={on ? "page" : undefined}
                      className={`${railRow} ${on ? "bg-surface font-medium text-ink shadow-[var(--shadow-card)] ring-1 ring-line" : ""}`}>
                      {/* Active marker: a short jade bar on the inner edge. */}
                      <span aria-hidden="true" className={`absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-brand-2 transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
                      <Icon size={17} className={on ? "text-brand-2" : "text-slate-400 group-hover/row:text-slate-600"} />
                      <span className="flex-auto truncate">{t.nav}</span>
                      <span aria-hidden="true" className="text-[11px] text-slate-400 opacity-0 group-hover/row:opacity-100">G {t.key.toUpperCase()}</span>
                      <PendingBar />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-line p-3">
        {admin.viewer && (
          <div className="mb-1 flex items-center gap-2 rounded-lg border border-info-line bg-info-tint px-3 py-2 text-[12.5px] text-info">
            <EyeIcon size={14} /> View only — Research Ledger
          </div>
        )}
        <ThemeRow />
        {!admin.viewer && (
          <a href="/export" download className={railRow}>
            <DownloadIcon size={17} className="text-slate-400 group-hover/row:text-slate-600" />
            Export CSV backup
          </a>
        )}
        <button type="button" onClick={onHelp} className={railRow}>
          <CommandIcon size={17} className="text-slate-400 group-hover/row:text-slate-600" />
          <span className="flex-auto text-left">Shortcuts</span>
          <Kbd>?</Kbd>
        </button>
        {!admin.viewer && (
          <AdminButton email={admin.email} lastChanged={admin.lastChanged} className={railRow}>
            <LockIcon size={17} className="text-slate-400 group-hover/row:text-slate-600" />
            <span className="flex min-w-0 flex-auto flex-col text-left leading-tight">
              Admin
              <span className="truncate text-[11.5px] text-slate-500">{admin.email}</span>
            </span>
          </AdminButton>
        )}
        <form action={admin.viewer ? exitViewMode : signOut}>
          <button type="submit" className={railRow}>
            <LogoutIcon size={17} className="text-slate-400 group-hover/row:text-slate-600" />
            {admin.viewer ? "Exit view mode" : "Log out"}
          </button>
        </form>
      </div>
    </aside>
  );
}

/** Sidebar row that flips the theme; says which theme you are in and which you'll get. */
function ThemeRow() {
  const { mode } = useTheme();
  const next = mode === "dark" ? "light" : "dark";
  return (
    <button type="button" className={railRow}
      aria-label={`Theme: ${THEME_NAMES[mode]}. Switch to ${THEME_NAMES[next]} (T)`}
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTheme(next, { x: r.left + 20, y: r.top + r.height / 2 }); }}>
      {mode === "dark" ? <MoonIcon size={17} className="text-slate-400 group-hover/row:text-slate-600" /> : <SunIcon size={17} className="text-slate-400 group-hover/row:text-slate-600" />}
      <span className="flex min-w-0 flex-auto flex-col text-left leading-tight">
        {THEME_NAMES[mode]}
        <span className="truncate text-[11.5px] text-slate-500">Switch to {next === "dark" ? "dark" : "light"}</span>
      </span>
      <Kbd>T</Kbd>
    </button>
  );
}

/** <1024px: compact top bar. Sections live in the bottom tab bar; secondary actions in the "More" menu. */
function MobileHeader({ admin, onSearch, onHelp, onAdmin }: {
  admin: AdminInfo; onSearch: () => void; onHelp: () => void; onAdmin: () => void;
}) {
  const tabs = useTabs();
  const [scrolled, setScrolled] = useState(false);
  const exitRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Sections that don't fit the bottom tab bar live here on phones and tablets.
  const secondary: MenuItem[] = tabs.filter((t) => !t.primary).map((t) => {
    const Icon = t.icon;
    return { kind: "link" as const, label: t.nav, icon: <Icon size={17} />, href: t.href };
  });
  const items: MenuItem[] = [
    ...secondary,
    ...(secondary.length ? [{ kind: "separator" as const }] : []),
    ...(!admin.viewer ? [{ kind: "link" as const, label: "Export CSV backup", icon: <DownloadIcon size={17} />, href: "/export", download: true }] : []),
    { label: "Shortcuts & appearance", icon: <CommandIcon size={17} />, onSelect: onHelp },
    ...(!admin.viewer ? [{ label: "Admin password", icon: <LockIcon size={17} />, onSelect: onAdmin }] : []),
    { kind: "separator" },
    { label: admin.viewer ? "Exit view mode" : "Log out", icon: <LogoutIcon size={17} />, danger: true, onSelect: () => exitRef.current?.requestSubmit() },
  ];

  return (
    <header style={{ viewTransitionName: "site-header" }}
      className={`page-gutter sticky top-0 z-40 border-b bg-page/90 pt-[env(safe-area-inset-top)] backdrop-blur-md transition-[border-color,box-shadow] duration-200 lg:hidden ${
        scrolled ? "border-line shadow-[0_8px_24px_-18px_rgba(10,13,19,0.4)]" : "border-transparent"
      }`}>
      <div className="flex min-h-14 items-center gap-1.5">
        <Link href={tabs[0].href} aria-label="MRRMR, home" className="group mr-auto flex items-center rounded-lg py-2 text-[14px]">
          <Wordmark size={28} />
        </Link>
        {admin.viewer && <Badge tone="info" className="mr-1 max-[359px]:hidden"><EyeIcon size={12} />View only</Badge>}
        <button type="button" onClick={onSearch} aria-label="Search pages, people and actions"
          className="inline-grid size-10 place-items-center rounded-lg text-slate-600 hover:bg-soft hover:text-ink">
          <SearchIcon size={19} />
        </button>
        <ThemeToggle className="border-transparent bg-transparent" />
        <Menu label="More" trigger={<MoreIcon size={20} />} items={items} />
        <form ref={exitRef} action={admin.viewer ? exitViewMode : signOut} className="hidden" />
      </div>
    </header>
  );
}

/** <1024px: the sections as a thumb-reach tab bar fixed to the bottom edge, clear of the home indicator. */
function MobileNav({ tabs, active }: { tabs: Tab[]; active?: string }) {
  return (
    <nav aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <ul className="m-0 mx-auto flex max-w-[640px] list-none p-0">
        {tabs.filter((t) => t.primary).map((t) => {
          const on = t.href === active;
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex flex-1">
              <Link href={t.href} aria-current={on ? "page" : undefined}
                className={`relative flex min-h-[var(--bottom-nav-h)] flex-1 flex-col items-center justify-center gap-1 text-[11px] ${on ? "font-semibold text-ink" : "text-slate-500"}`}>
                <span className={`grid h-7 w-14 place-items-center rounded-full transition-[background-color,scale] duration-300 ease-[var(--ease-spring)] ${on ? "scale-100 bg-good-tint-2 text-brand-ink" : "scale-90"}`}>
                  <Icon size={19} />
                </span>
                {t.short}
                <PendingBar />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ShortcutsDialog({ tabs, onClose }: { tabs: Tab[]; onClose: () => void }) {
  const SHORTCUTS: [string[], string][] = [
    [["Ctrl", "K"], "Search pages, people and actions"],
    [["/"], "Open search"],
    ...tabs.map((t): [string[], string] => [["G", t.key.toUpperCase()], `Go to ${t.label}`]),
    [["T"], "Switch Executive Minimal / Midnight Finance"],
    [["←", "→"], "Move between months in a chart"],
    [["Esc"], "Close a dialog or menu"],
    [["?"], "Show this list"],
  ];
  return (
    <Modal title="Shortcuts & appearance" onClose={onClose} maxWidth={440} side>
      <div className="flex flex-col gap-2 border-b border-line px-5 py-4">
        <span className="eyebrow">Theme</span>
        <ThemeSegment stacked />
      </div>
      <div className="px-5 pt-4"><span className="eyebrow">Keyboard</span></div>
      <ul className="m-0 flex list-none flex-col p-2">
        {SHORTCUTS.map(([keys, what]) => (
          <li key={what} className="flex min-h-11 items-center justify-between gap-4 rounded-lg px-3 text-[14px] hover:bg-subtle">
            <span className="text-slate-700">{what}</span>
            <span className="flex flex-none items-center gap-1">
              {keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && keys[0] === "G" && <span className="text-[11px] text-slate-400">then</span>}
                  <Kbd>{k}</Kbd>
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
    <button type="button" aria-label="Back to top" tabIndex={show ? 0 : -1} aria-hidden={!show}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
      className={`fixed bottom-[calc(var(--bottom-nav-h)+12px+env(safe-area-inset-bottom))] right-4 z-30 grid size-11 place-items-center rounded-full border border-line bg-surface text-slate-600 shadow-[var(--shadow-lift)] hover:text-ink lg:bottom-6 lg:right-6 ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      } duration-300`}>
      <ArrowUpIcon size={18} />
    </button>
  );
}

/** Contextual page header (eyebrow, title, one-line description, the page's actions), then the page. */
export function Shell({
  subtitle,
  actions,
  children,
  hero,
}: {
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** replaces the standard page header (the Overview's financial hero) */
  hero?: React.ReactNode;
}) {
  const admin = useContext(AdminContext);
  const path = usePathname();
  const tab = TABS.find((t) => path.startsWith(t.href));
  const Icon = tab?.icon;

  return (
    <main id="main" tabIndex={-1}
      className="page-gutter pb-[calc(var(--bottom-nav-h)+40px+env(safe-area-inset-bottom))] pt-5 outline-none sm:pt-7 lg:pb-20 lg:pt-10">
      {/* Keyed by route so each page plays its entrance, including Card 1 → Card 2 which reuses the same component. */}
      <div key={path} className="page-enter mx-auto flex max-w-[1180px] flex-col gap-5 sm:gap-6">
        {hero ?? <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-5 sm:pb-6">
          <div className="min-w-0 max-w-[720px]">
            <div className="eyebrow flex items-center gap-2">
              {Icon && <Icon size={14} className="text-brand-2" />}
              {tab?.group ?? "MRRMR"}
              {admin.viewer && <Badge tone="info" className="ml-1 normal-case tracking-normal"><EyeIcon size={12} />View only</Badge>}
            </div>
            <h1 className="m-0 mt-2 font-display text-title font-normal text-ink">{tab?.label ?? "Finance"}</h1>
            <p className="m-0 mt-2 text-[14.5px] text-slate-500">{subtitle}</p>
          </div>
          {!admin.viewer && actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
        </header>}
        {children}
      </div>
    </main>
  );
}

/** Page-level button in the header: solid for the main action, outlined for the rest. */
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
    <button type="button" onClick={onClick}
      className={buttonClass(variant === "green" ? "primary" : "secondary", "md", "flex-auto sm:flex-none")}>
      {children}
    </button>
  );
}
