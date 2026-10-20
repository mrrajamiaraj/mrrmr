"use client";

import { useEffect, useId, useRef } from "react";
import { CloseIcon } from "@/components/icons";

/** Centered dialog: plain title row, content, and a footer for its buttons. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  maxWidth = 580,
  header,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
  /** replaces the default title bar */
  header?: (titleId: string) => React.ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  // Runs once on open: parents pass inline onClose callbacks, which must not re-trigger focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(28,27,24,0.4)] pt-4 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Phones: a sheet from the bottom edge; larger screens: centered. dvh keeps it clear of mobile browser bars. */}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth }}
        className="max-h-[calc(100dvh-16px)] w-full overflow-y-auto overscroll-contain rounded-t-xl bg-white pb-[env(safe-area-inset-bottom)] text-left shadow-[0_20px_50px_-12px_rgba(28,27,24,0.35)] sm:max-h-[calc(100dvh-32px)] sm:rounded-lg sm:pb-0"
      >
        {header ? (
          header(titleId)
        ) : (
          <div className="flex items-center justify-between gap-3 border-b border-line py-2 pl-5 pr-2">
            <h2 id={titleId} className="m-0 flex items-center gap-2 text-[16px] font-semibold">{title}</h2>
            <CloseButton onClick={onClose} />
          </div>
        )}
        {children}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function CloseButton({ onClick, label = "Close" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex size-10 flex-none items-center justify-center rounded-md text-slate-500 hover:bg-soft hover:text-ink">
      <CloseIcon size={18} />
    </button>
  );
}

export function ErrorBox({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="alert" className={`rounded-md bg-[#F5E4E0] px-3.5 py-2.5 text-sm font-medium text-[#7E2A1F] ${className}`}>
      {children}
    </div>
  );
}

export const btnPrimary = "min-h-10 rounded-md bg-brand px-4 text-[14px] font-medium text-white hover:bg-[#173D2E]";
export const btnGhost = "min-h-10 rounded-md px-3.5 text-[14px] text-slate-700 hover:bg-soft";
