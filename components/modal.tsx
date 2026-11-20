"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { haptic } from "@/lib/haptics";

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

  // Phones: when the on-screen keyboard opens, iOS Safari doesn't resize the layout, so the sheet would sit under it.
  // Follow the visual viewport instead: lift the sheet by the keyboard's height and cap it to what's visible, then
  // keep the focused field in view. (Android uses interactive-widget=resizes-content and needs no help.)
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const overlay = overlayRef.current;
    if (!vv || !overlay) return;
    const fit = () => {
      const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      overlay.style.paddingBottom = keyboard > 60 ? `${keyboard}px` : "";
      if (ref.current) ref.current.style.maxHeight = keyboard > 60 ? `${vv.height - 12}px` : "";
      const el = document.activeElement as HTMLElement | null;
      if (keyboard > 60 && el && ref.current?.contains(el)) el.scrollIntoView({ block: "nearest" });
    };
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); };
  }, []);

  // Phones: drag the sheet down by its handle or title bar to close it, like a native sheet. Below 120px (and not
  // flicked) it springs back. Buttons in the bar keep working; mouse and wide screens are unaffected.
  const drag = useRef<{ y: number; t: number; dy: number; id: number } | null>(null);
  const onDragStart = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" || window.innerWidth >= 640 || (e.target as Element).closest("button, a, input, select, textarea")) return;
    drag.current = { y: e.clientY, t: e.timeStamp, dy: 0, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (ref.current) ref.current.style.transition = "none";
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id || !ref.current) return;
    d.dy = Math.max(0, e.clientY - d.y);
    // Follows the finger downward only; the backdrop fades as the sheet leaves.
    ref.current.style.transform = `translateY(${d.dy}px)`;
    if (overlayRef.current) overlayRef.current.style.backgroundColor = `rgba(10,13,19,${0.45 * Math.max(0.2, 1 - d.dy / 400)})`;
  };
  const onDragEnd = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    const sheet = ref.current;
    if (!d || !sheet) return;
    const velocity = d.dy / Math.max(1, e.timeStamp - d.t);
    sheet.style.transition = "transform 260ms var(--ease-out-expo)";
    if (d.dy > 120 || (velocity > 0.6 && d.dy > 30)) {
      sheet.style.transform = "translateY(100%)";
      haptic("tap");
      setTimeout(() => closeRef.current(), 200);
    } else {
      sheet.style.transform = "";
      if (overlayRef.current) overlayRef.current.style.backgroundColor = "";
    }
  };
  const dragProps = { onPointerDown: onDragStart, onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragEnd };

  // Rendered into <body>: an opener inside a transformed or blurred container (the sidebar, an animating section)
  // would otherwise become the box that "fixed" is measured against, squeezing the dialog to that container's width.
  const dialog = (
    <div
      ref={overlayRef}
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
        {/* Drag zone (phones): the grab handle and the title bar. touch-action:none so the browser doesn't scroll instead. */}
        <div {...dragProps} className="sticky top-0 z-10 touch-none bg-surface sm:static sm:touch-auto">
          <div aria-hidden="true" className="flex h-5 items-center justify-center sm:hidden">
            <span className="h-1 w-10 rounded-full bg-line-strong" />
          </div>
          {header ? (
            header(titleId)
          ) : (
            <div className="flex items-center justify-between gap-3 border-b border-line py-2 pl-5 pr-2">
              <h2 id={titleId} className="m-0 flex items-center gap-2 text-[16px] font-semibold">{title}</h2>
              <CloseButton onClick={onClose} />
            </div>
          )}
        </div>
        {children}
        {footer && (
          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">{footer}</div>
        )}
      </div>
    </div>
  );
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
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
