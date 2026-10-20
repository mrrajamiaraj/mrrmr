"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminButton } from "@/components/admin-button";
import { DownloadIcon, EyeIcon, LogoutIcon } from "@/components/icons";
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

const TABS = [
  { href: "/account", label: "Bank Account" },
  { href: "/debtors", label: "Debtors & Loans" },
  { href: "/cards/1", label: CARD_NAMES[1] },
  { href: "/cards/2", label: CARD_NAMES[2] },
  { href: "/research", label: "Research Finance" },
];

const pad = "px-[clamp(16px,4vw,40px)]";
const logoutBtn = "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-line px-2.5 text-[13.5px] text-slate-700 hover:bg-soft sm:px-3";

/** Top bar with the section links, then the page title, its one-line description and the page's buttons. */
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
  const title = TABS.find((t) => path.startsWith(t.href))?.label ?? "Finance";

  return (
    <div className="min-h-dvh">
      <header className={`border-b border-line bg-white ${pad}`}>
        {/* Phones: logo and buttons on one row, the section tabs scroll sideways on a row below. */}
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 md:flex-nowrap">
          <Link href="/account" className="flex-none py-3 text-[15px] font-semibold text-ink">
            Ledger<span className="text-brand-2">.</span>
          </Link>
          <nav aria-label="Sections" className="order-last -mx-[clamp(16px,4vw,40px)] -mb-px flex w-[calc(100%_+_2*clamp(16px,4vw,40px))] gap-5 overflow-x-auto border-t border-soft px-[clamp(16px,4vw,40px)] [scrollbar-width:none] md:order-none md:mx-0 md:w-auto md:min-w-0 md:flex-auto md:border-t-0 md:px-0">
            {TABS.map((t) => {
              const on = path.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={`whitespace-nowrap border-b-2 py-3.5 text-[13.5px] ${
                    on ? "border-ink font-medium text-ink" : "border-transparent text-slate-500 hover:text-ink"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex flex-none items-center gap-2 sm:gap-3">
            <a href="/export" download aria-label="Export CSV" className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap px-1 text-[13.5px] text-slate-600 hover:text-ink">
              <DownloadIcon size={15} />
              <span className="hidden sm:inline">Export CSV</span>
            </a>
            {admin.viewer ? (
              <form action={exitViewMode}>
                <button type="submit" className={logoutBtn}>
                  <LogoutIcon size={15} />
                  Log out
                </button>
              </form>
            ) : (
              <>
                <AdminButton email={admin.email} lastChanged={admin.lastChanged} />
                <form action={signOut}>
                  <button type="submit" aria-label="Log out" className={logoutBtn}>
                    <LogoutIcon size={15} />
                    <span className="hidden sm:inline">Log out</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </header>

      <main className={`${pad} pb-16 pt-6 sm:pb-20 sm:pt-8`}>
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 sm:gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 max-w-[720px]">
              <h1 className="m-0 flex flex-wrap items-center gap-2.5 text-[22px] font-semibold leading-tight sm:text-[26px]">
                {title}
                {admin.viewer && (
                  <span className="inline-flex items-center gap-1 rounded border border-line bg-white px-1.5 py-0.5 text-[11.5px] font-medium text-slate-600">
                    <EyeIcon size={12} />
                    View only
                  </span>
                )}
              </h1>
              <p className="m-0 mt-1 text-[14px] text-slate-500">{subtitle}</p>
            </div>
            {!admin.viewer && actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
          </div>
          {children}
        </div>
      </main>
    </div>
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
      className={`inline-flex min-h-10 flex-auto items-center justify-center gap-2 rounded-md px-3.5 text-[14px] font-medium sm:flex-none ${
        variant === "green" ? "bg-brand text-white hover:bg-[#173D2E]" : "border border-[#D6D3CB] bg-white text-ink hover:bg-soft"
      }`}
    >
      {children}
    </button>
  );
}
