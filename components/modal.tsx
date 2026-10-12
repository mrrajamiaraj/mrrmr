"use client";

import { useEffect, useId, useRef } from "react";
import { CloseIcon } from "@/components/icons";

/** Centered dialog with the dark-teal title bar used throughout the designs. */
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.5)] p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth }}
        className="max-h-[calc(100vh-32px)] w-full overflow-y-auto rounded-[14px] bg-white text-left shadow-[0_24px_60px_rgba(15,23,42,0.35)]"
      >
        {header ? (
          header(titleId)
        ) : (
          <div className="flex items-center justify-between gap-3 bg-brand px-5 py-4 text-white">
            <h2 id={titleId} className="m-0 flex items-center gap-2.5 text-xl font-bold">{title}</h2>
            <CloseButton onClick={onClose} />
          </div>
        )}
        {children}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line bg-[#F8FAFC] px-5 py-3.5">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function CloseButton({ onClick, label = "Close" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex size-11 flex-none items-center justify-center text-white">
      <CloseIcon size={20} />
    </button>
  );
}

export function ErrorBox({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="alert" className={`rounded-[10px] bg-[#FEE2E2] px-3.5 py-2.5 text-sm font-medium text-[#991B1B] ${className}`}>
      {children}
    </div>
  );
}

export const btnPrimary = "min-h-11 rounded-[10px] bg-brand px-5 text-[15px] font-semibold text-white";
export const btnGhost = "min-h-11 px-4 text-[15px] font-medium text-slate-700";
