"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { haptic, noteTouch } from "@/lib/haptics";

/**
 * Phone behaviour shared by every page (mounted once in the root layout). Pure event delegation, so it works the same
 * in iOS Safari, Chrome, Samsung Internet and Firefox on phones, and does nothing for mouse users:
 *  - a light vibration when a button, tab, link or chip is tapped (Android browsers; iOS has no vibration API);
 *  - long-press on anything with a `title` shows it as a tip (hover tooltips are otherwise invisible on touch);
 *  - pull-to-refresh when MRRMR is opened from the home screen (standalone mode has no browser pull-to-refresh).
 */
export function TouchLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const router = useRouter();
  const [pull, setPull] = useState(0); // 0…1 progress of the pull-to-refresh gesture
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef(false);

  // ---- tap feedback + long-press tips ------------------------------------------------------------------------
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;
    let tipShown = false;
    let touchAt = 0;
    const tappable = 'button:not(:disabled), a[href], [role="tab"], [role="option"], [role="switch"], [role="menuitem"], summary, label:has(input)';

    const clear = () => { if (timer) clearTimeout(timer); timer = null; };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      noteTouch();
      touchAt = Date.now();
      // A new touch starts fresh: the previous long-press tip no longer blocks this tap.
      if (tipShown) { tipShown = false; setTip(null); }
      const target = e.target as Element | null;
      const titled = target?.closest<HTMLElement>("[title], [data-tip]");
      const text = titled?.getAttribute("data-tip") || titled?.getAttribute("title");
      start = { x: e.clientX, y: e.clientY };
      clear();
      if (!titled || !text) return;
      timer = setTimeout(() => {
        const r = titled.getBoundingClientRect();
        tipShown = true;
        haptic("tap");
        setTip({ text, x: Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90), y: Math.max(r.top - 8, 56) });
      }, 480);
    };
    const onMove = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) clear();
    };
    const onUp = () => {
      clear();
      // Keep the tip up a moment after lifting; the click that ends this long-press is swallowed (onClick) first.
      if (tipShown) setTimeout(() => setTip(null), 1600);
    };
    // A long-press that showed a tip must not also open the browser's context menu or "tap" the control.
    const onMenu = (e: Event) => { if (tipShown) e.preventDefault(); };
    const onClick = (e: MouseEvent) => {
      if (tipShown) { tipShown = false; e.preventDefault(); e.stopPropagation(); return; }
      // Vibrate on a real tap only (a click right after a touch), never when a scroll merely started on a button.
      if (Date.now() - touchAt < 1000 && (e.target as Element | null)?.closest(tappable)) haptic("tick");
    };
    const onScroll = () => { clear(); setTip(null); };

    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointercancel", onUp, { passive: true });
    document.addEventListener("contextmenu", onMenu);
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clear();
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.removeEventListener("contextmenu", onMenu);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // ---- pull-to-refresh (home-screen app only) ------------------------------------------------------------------
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return; // in a browser tab the browser's own pull-to-refresh is already there
    const THRESHOLD = 90;
    let y0: number | null = null;
    let dist = 0;
    const blocked = (t: EventTarget | null) => !!(t as Element | null)?.closest('[role="dialog"], input, textarea, select, [data-no-pull]');

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshRef.current || e.touches.length !== 1 || blocked(e.target)) { y0 = null; return; }
      y0 = e.touches[0].clientY;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (y0 == null) return;
      dist = e.touches[0].clientY - y0;
      if (dist <= 0 || window.scrollY > 0) { setPull(0); return; }
      const p = Math.min(dist / THRESHOLD, 1.4);
      setPull(p);
      if (p >= 1 && dist - 2 < THRESHOLD) haptic("tick");
    };
    const onEnd = () => {
      if (y0 == null) return;
      y0 = null;
      if (dist >= THRESHOLD) {
        refreshRef.current = true;
        setRefreshing(true);
        haptic("success");
        router.refresh();
        setTimeout(() => { refreshRef.current = false; setRefreshing(false); setPull(0); }, 900);
      } else setPull(0);
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const shown = refreshing ? 1 : Math.min(pull, 1);
  return (
    <>
      {(pull > 0 || refreshing) && (
        <div aria-hidden="true" data-float className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-[90] flex justify-center"
          style={{ transform: `translateY(${shown * 64 - 8}px)`, opacity: Math.min(shown * 1.4, 1) }}>
          <span className="grid size-10 place-items-center rounded-full border border-line bg-surface text-brand-2 shadow-[var(--shadow-lift)]">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
              className={refreshing ? "animate-spin" : ""} style={refreshing ? undefined : { transform: `rotate(${shown * 300}deg)` }}>
              <path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" />
            </svg>
          </span>
        </div>
      )}
      {refreshing && <span role="status" className="sr-only">Refreshing</span>}
      {tip && (
        <div role="tooltip" data-float className="pointer-events-none fixed z-[95] max-w-[240px] -translate-x-1/2 -translate-y-full animate-pop-in rounded-lg bg-ink px-3 py-2 text-[13px] leading-snug text-on-ink shadow-[var(--shadow-pop)]"
          style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </>
  );
}
