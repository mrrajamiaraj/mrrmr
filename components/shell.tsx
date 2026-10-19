"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminButton } from "@/components/admin-button";
import { DownloadIcon, EyeIcon, LogoutIcon } from "@/components/icons";
import { exitViewMode } from "@/app/view/actions";
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

/** Gradient header + section nav from the designs. Each page supplies its icon, subtitle and buttons. */
export function Shell({
  icon,
  subtitle,
  actions,
  children,
}: {
  icon: React.ReactNode;
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const admin = useContext(AdminContext);
  const path = usePathname();

  return (
    <div className="min-h-screen">
      <header className="bg-[linear-gradient(100deg,#0F5A50_0%,#0B3D38_100%)] px-[clamp(16px,4vw,48px)] py-[22px] text-white">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex size-[46px] flex-none items-center justify-center rounded-xl bg-[#1D6E63]">{icon}</div>
            <div className="min-w-0">
              <div className="text-[clamp(18px,2.2vw,26px)] font-bold uppercase tracking-[-0.01em]">
                Personal Finance &amp; Loan Recovery Workspace
              </div>
              <div className="text-[14.5px] text-mint">{subtitle}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {admin.viewer ? (
              <>
                <span className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[10px] bg-[#1D6E63] px-3.5 font-semibold text-white">
                  <EyeIcon size={16} />
                  View only
                </span>
                <form action={exitViewMode}>
                  <button type="submit" className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[10px] border border-[#5EEAD4] bg-[#0B3D38] px-3.5 font-semibold text-white">
                    <LogoutIcon size={16} />
                    Exit
                  </button>
                </form>
              </>
            ) : (
              <>
                {actions}
                <AdminButton email={admin.email} lastChanged={admin.lastChanged} />
              </>
            )}
          </div>
        </div>
      </header>

      <nav aria-label="Sections" className="border-b border-line bg-white px-[clamp(16px,4vw,48px)]">
        <div className="mx-auto flex max-w-[1240px] items-center gap-2 overflow-x-auto py-2.5">
          {TABS.map((t) => {
            const on = path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-[10px] px-4 ${
                  on ? "bg-brand font-semibold text-white" : "bg-soft font-medium text-slate-800"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
          <a
            href="/export"
            download
            className="ml-auto inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[10px] border border-line px-4 font-medium text-slate-700"
          >
            <DownloadIcon size={16} />
            Export CSV
          </a>
        </div>
      </nav>

      <main className="px-[clamp(16px,4vw,48px)] pb-[72px] pt-7">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-[22px]">{children}</div>
      </main>
    </div>
  );
}

/** Green "Add Debtor"-style header button. */
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
      className={`inline-flex min-h-11 items-center gap-2 rounded-[10px] px-4 text-[15px] font-semibold ${
        variant === "green" ? "bg-[#10B981] text-[#04241B]" : "border border-[#5EEAD4] bg-brand-3 text-white"
      }`}
    >
      {children}
    </button>
  );
}
