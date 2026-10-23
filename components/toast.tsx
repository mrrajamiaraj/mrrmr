"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckIcon, CloseIcon } from "@/components/icons";

type Toast = { id: number; text: string; leaving: boolean };

// A tiny store outside React so any component can raise a toast without a provider.
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const EMPTY: Toast[] = [];

export function toast(text: string) {
  toasts = [...toasts.slice(-2), { id: nextId++, text, leaving: false }];
  emit();
}

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
    <div data-float aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
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
    <div role="status" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      className={`pointer-events-auto relative flex w-full max-w-[420px] items-start gap-3 overflow-hidden rounded-xl bg-ink py-3 pl-3.5 pr-2 text-[14px] text-white shadow-[var(--shadow-pop)] ${
        t.leaving ? "translate-y-2 opacity-0 transition-[translate,opacity] duration-200" : "animate-pop-in"
      }`}>
      <span aria-hidden="true" className="mt-px grid size-5 flex-none place-items-center rounded-full bg-[#2E6B52] text-white">
        <CheckIcon size={12} />
      </span>
      <span className="min-w-0 flex-auto leading-snug">{t.text}</span>
      <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}
        className="-my-1 grid size-7 flex-none place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white">
        <CloseIcon size={14} />
      </button>
      {/* Time left before it goes away; stops while the pointer is on it. */}
      <span aria-hidden="true" key={String(paused)}
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-[#6FA58A]"
        style={{ animation: paused ? "none" : `grow-x ${LIFETIME}ms linear reverse both` }} />
    </div>
  );
}
