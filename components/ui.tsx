"use client";

// MRRMR design-system primitives. Pages compose these instead of repeating class strings, so a change to how a
// button, badge or empty state looks happens once. Everything here is display-only: no component computes an
// authoritative amount (figures come from lib/ledger, lib/money and the database).

import { useEffect, useId, useRef, useState } from "react";
import { AlertIcon, InboxIcon, RetryIcon } from "@/components/icons";
import { taka, takaExact } from "@/lib/format";
import { usePrefs } from "@/components/prefs";

// ---- Buttons --------------------------------------------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium select-none disabled:pointer-events-none";
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-[13px]",
  md: "min-h-10 px-4 text-[14px]",
  lg: "min-h-12 px-5 text-[15px]",
};
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white shadow-[var(--shadow-brand)] hover:bg-brand-hover hover:shadow-[var(--shadow-brand-hover)]",
  secondary: "border border-line-strong bg-surface text-ink shadow-[var(--shadow-card)] hover:border-slate-400 hover:bg-subtle",
  ghost: "text-slate-700 hover:bg-soft hover:text-ink",
  danger: "bg-bad-solid text-white shadow-[var(--shadow-card)] hover:bg-bad-solid-hover",
  quiet: "text-brand-2 hover:bg-good-tint",
};

/** Class string for a button (also for links styled as buttons). */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = "") {
  return `${BTN_BASE} ${BTN_SIZE[size]} ${BTN_VARIANT[variant]} ${extra}`;
}

export function Button({
  variant = "primary", size = "md", className = "", pending = false, pendingLabel, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: ButtonSize; pending?: boolean; pendingLabel?: string;
}) {
  return (
    <button type="button" {...rest} disabled={rest.disabled || pending} aria-busy={pending || undefined}
      className={buttonClass(variant, size, className)}>
      {pending && <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** Square icon-only button. `label` is required: it is the accessible name and the tooltip. */
export function IconButton({
  label, children, className = "", size = 40, ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & { label: string; size?: 36 | 40 | 44 }) {
  const dim = size === 36 ? "size-9" : size === 44 ? "size-11" : "size-10";
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={`inline-grid ${dim} flex-none place-items-center rounded-lg text-slate-600 hover:bg-soft hover:text-ink ${className}`}>
      {children}
    </button>
  );
}

// ---- Money, status and badges -----------------------------------------------------------------------------------

const MONEY_TONE = { ink: "text-ink", owed: "text-owed", good: "text-brand-2", bad: "text-bad", muted: "text-slate-500" } as const;
export type MoneyTone = keyof typeof MONEY_TONE;

/**
 * A taka amount with tabular digits. `signed` shows + / − from the value's sign (the value itself is never
 * altered). Screen readers hear "minus" / "plus" rather than a dash.
 */
export function Money({ value, tone = "ink", signed = false, className = "" }: {
  value: number; tone?: MoneyTone; signed?: boolean; className?: string;
}) {
  const { paisa } = usePrefs();
  const sign = signed && value !== 0 ? (value < 0 ? "−" : "+") : "";
  return (
    <span data-money className={`money ${MONEY_TONE[tone]} ${className}`}>
      {sign && <span aria-hidden="true">{sign}&thinsp;</span>}
      {sign && <span className="sr-only">{value < 0 ? "minus " : "plus "}</span>}
      {paisa ? takaExact(value) : taka(value)}
    </span>
  );
}

const BADGE_TONE = {
  neutral: "border-line bg-soft text-slate-700",
  good: "border-good-line bg-good-tint text-brand-ink",
  owed: "border-owed-line bg-owed-tint text-owed",
  bad: "border-bad-line bg-bad-tint text-bad",
  info: "border-info-line bg-info-tint text-info",
} as const;
export type BadgeTone = keyof typeof BADGE_TONE;

/** Small label. `dot` adds a status dot; colour is never the only signal — the text says the same thing. */
export function Badge({ tone = "neutral", dot = false, children, className = "" }: {
  tone?: BadgeTone; dot?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-medium leading-5 ${BADGE_TONE[tone]} ${className}`}>
      {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-line border-b-line-strong bg-surface px-1.5 py-px font-sans text-[11.5px] font-medium text-slate-600">
      {children}
    </kbd>
  );
}

// ---- Empty, error and loading states ----------------------------------------------------------------------------

/** Nothing to show yet: what this is for, and the next useful step. */
export function EmptyState({ title, children, action, icon, compact = false }: {
  title: string; children?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface/60 text-center ${compact ? "px-5 py-7" : "px-6 py-12"}`}>
      <span aria-hidden="true" className="mb-1 grid size-11 place-items-center rounded-xl bg-soft text-slate-500">
        {icon ?? <InboxIcon size={22} />}
      </span>
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {children && <div className="max-w-[440px] text-[13.5px] text-slate-500">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Something failed: say what, keep the details readable, offer a retry. */
export function ErrorState({ title = "Something went wrong", children, onRetry, retryLabel = "Try again" }: {
  title?: string; children?: React.ReactNode; onRetry?: () => void; retryLabel?: string;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-bad-line bg-bad-tint px-6 py-10 text-center">
      <span aria-hidden="true" className="mb-1 grid size-11 place-items-center rounded-xl bg-surface text-bad"><AlertIcon size={22} /></span>
      <div className="text-[15px] font-semibold text-bad-deep">{title}</div>
      {children && <div className="max-w-[480px] text-[13.5px] text-slate-700">{children}</div>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          <RetryIcon size={14} />{retryLabel}
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

// ---- Tooltip ----------------------------------------------------------------------------------------------------

/**
 * Supplementary hint on hover AND keyboard focus (WCAG 1.4.13: dismissable with Esc, hoverable, persistent).
 * Never put critical financial detail only in a tooltip — it must also be on the page.
 */
export function Tooltip({ content, children, side = "top" }: {
  content: React.ReactNode; children: React.ReactElement<{ "aria-describedby"?: string }>; side?: "top" | "bottom";
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <span className="relative inline-flex"
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)} onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      <span aria-describedby={id} className="inline-flex">{children}</span>
      <span id={id} role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-[260px] -translate-x-1/2 rounded-md bg-ink px-2.5 py-1.5 text-[12.5px] font-medium leading-snug text-on-ink shadow-[var(--shadow-lift)] transition-opacity duration-150 ${
          side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
        } ${open ? "opacity-100" : "invisible opacity-0"}`}>
        {content}
      </span>
    </span>
  );
}

// ---- Menu (context / overflow menu) ------------------------------------------------------------------------------

export type MenuItem =
  | { kind?: "item"; label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean }
  | { kind: "link"; label: string; icon?: React.ReactNode; href: string; download?: boolean }
  | { kind: "separator" };

/**
 * WAI-ARIA menu button: Enter/Space/↓ opens and focuses the first item, ↑/↓/Home/End move, Esc or Tab closes and
 * returns focus to the button, clicking outside closes.
 */
export function Menu({ label, trigger, items, align = "end", triggerClass = "" }: {
  label: string; trigger: React.ReactNode; items: MenuItem[]; align?: "start" | "end"; triggerClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const focusItem = (i: number) => {
    const els = list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!els?.length) return;
    els[(i + els.length) % els.length].focus();
  };

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => focusItem(0));
    const onDown = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };

  const onListKey = (e: React.KeyboardEvent) => {
    const els = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); focusItem(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusItem(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusItem(0); }
    else if (e.key === "End") { e.preventDefault(); focusItem(els.length - 1); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") close(false);
  };

  const itemClass = (danger?: boolean) =>
    `flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-[14px] outline-none focus-visible:bg-soft hover:bg-soft ${danger ? "text-bad" : "text-ink"}`;

  return (
    <div className="relative">
      <button ref={btn} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); } }}
        className={triggerClass || "inline-grid size-10 place-items-center rounded-lg text-slate-600 hover:bg-soft hover:text-ink"}>
        {trigger}
      </button>
      {open && (
        <div ref={list} id={menuId} role="menu" aria-label={label} onKeyDown={onListKey}
          className={`absolute top-[calc(100%+6px)] z-50 min-w-[220px] animate-pop-in rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)] ${align === "end" ? "right-0" : "left-0"}`}>
          {items.map((it, i) =>
            it.kind === "separator" ? (
              <div key={i} role="separator" className="my-1 h-px bg-line" />
            ) : it.kind === "link" ? (
              <a key={i} role="menuitem" tabIndex={-1} href={it.href} download={it.download} onClick={() => close(false)} className={itemClass()}>
                <span aria-hidden="true" className="text-slate-500">{it.icon}</span>{it.label}
              </a>
            ) : (
              <button key={i} type="button" role="menuitem" tabIndex={-1} onClick={() => { close(false); it.onSelect(); }} className={itemClass(it.danger)}>
                <span aria-hidden="true" className={it.danger ? "" : "text-slate-500"}>{it.icon}</span>{it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
