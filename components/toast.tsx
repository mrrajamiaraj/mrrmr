"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "@/components/icons";

export type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; leaving: boolean; tone: ToastTone };

// A tiny store outside React so any component can raise a toast without a provider.
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const EMPTY: Toast[] = [];

/** Shows a toast. Success is the default (every existing call is a "saved" confirmation). */
export function toast(text: string, tone: ToastTone = "success") {
  toasts = [...toasts.slice(-2), { id: nextId++, text, leaving: false, tone }];
  emit();
}

const TONE_ICON: Record<ToastTone, { bg: string; icon: React.ReactNode; label: string }> = {
  success: { bg: "bg-brand", icon: <CheckIcon size={12} />, label: "Done" },
  error: { bg: "bg-bad-solid", icon: <AlertIcon size={12} />, label: "Error" },
  info: { bg: "bg-info", icon: <InfoIcon size={12} />, label: "Note" },
};

function dismiss(id: number) {
  toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit(); }, 220);
}

const LIFETIME = 5000;

/** Bottom-right stack on desktop, bottom-centre on phones. Mounted once in the dashboard layout. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
  return (
    <div data-float aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-[calc(var(--bottom-nav-h)+14px+env(safe-area-inset-bottom))] pt-4 sm:items-end sm:px-6 sm:pt-6 lg:pb-6">
      {list.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  );
}

function ToastItem({ t }: { t: Toast }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || t.leaving) return;
    const timer = setTimeout(() => dismiss(t.id), LIFETIME);
    return () => clearTimeout(timer);
  }, [paused, t.id, t.leaving]);

  return (
    <div role={t.tone === "error" ? "alert" : "status"} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      className={`pointer-events-auto relative flex w-full max-w-[420px] items-start gap-3 overflow-hidden rounded-xl bg-ink py-3 pl-3.5 pr-2 text-[14px] text-on-ink shadow-[var(--shadow-pop)] ${
        t.leaving ? "translate-y-2 opacity-0 transition-[translate,opacity] duration-200" : "animate-pop-in"
      }`}>
      <span aria-hidden="true" className={`mt-px grid size-5 flex-none place-items-center rounded-full text-white ${TONE_ICON[t.tone].bg}`}>
        {TONE_ICON[t.tone].icon}
      </span>
      <span className="min-w-0 flex-auto leading-snug"><span className="sr-only">{TONE_ICON[t.tone].label}: </span>{t.text}</span>
      <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}
        className="-my-1 grid size-7 flex-none place-items-center rounded-md text-on-ink/60 hover:bg-on-ink/10 hover:text-on-ink">
        <CloseIcon size={14} />
      </button>
      {/* Time left before it goes away; stops while the pointer is on it. */}
      <span aria-hidden="true" key={String(paused)}
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-brand-2"
        style={{ animation: paused ? "none" : `grow-x ${LIFETIME}ms linear reverse both` }} />
    </div>
  );
}
