"use client";

import { useEffect, useId, useRef } from "react";
import { CloseIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog: a bottom sheet on phones; centred on larger screens, or a drawer from the right edge with `side`.
 * Focus moves in on open, Tab is trapped, Esc and the backdrop close it, focus returns to the opener.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  maxWidth = 580,
  header,
  side = false,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
  /** replaces the default title bar */
  header?: (titleId: string) => React.ReactNode;
  /** drawer from the right edge on ≥640px instead of a centred dialog */
  side?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  // Runs once on open: parents pass inline onClose callbacks, which must not re-trigger focus.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeRef.current();
      // Keep Tab inside the dialog.
      if (e.key !== "Tab" || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // A field marked data-autofocus wins (e.g. a search box); otherwise the first control.
    (ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,button"))?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      // Hand focus back to whatever opened the dialog, if it is still on the page.
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      data-float
      className={`fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-[rgba(10,13,19,0.45)] pt-4 ${
        side ? "sm:items-stretch sm:justify-end sm:p-0" : "sm:items-center sm:p-4"
      }`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Phones: a sheet from the bottom edge; larger screens: centred, or a right-hand drawer. dvh keeps it clear of mobile browser bars. */}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth }}
        className={`max-h-[calc(100dvh-16px)] w-full animate-sheet-up overflow-y-auto overscroll-contain rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] text-left shadow-[var(--shadow-pop)] ${
          side ? "sm:max-h-none sm:animate-[pop-in_280ms_var(--ease-out-expo)_both] sm:rounded-none sm:rounded-l-2xl sm:border-l sm:border-line" : "sm:max-h-[calc(100dvh-32px)] sm:animate-pop-in sm:rounded-2xl"
        }`}
      >
        {/* Grab handle so the phone sheet reads as a sheet. */}
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" />
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
          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">{footer}</div>
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
    <div role="alert" className={`animate-pop-in rounded-md border border-bad-line bg-bad-tint px-3.5 py-2.5 text-sm font-medium text-bad-deep ${className}`}>
      {children}
    </div>
  );
}

// Kept for existing call sites; they are the design-system recipes from components/ui.
export const btnPrimary = buttonClass("primary");
export const btnDanger = buttonClass("danger");
export const btnGhost = buttonClass("ghost", "md", "px-3.5");
