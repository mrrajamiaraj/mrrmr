"use client";

import { useRef } from "react";
import { taka } from "@/lib/format";
import type { Card } from "@/lib/types";

const FACES: Record<1 | 2, string> = {
  1: "linear-gradient(135deg, #16705A 0%, #0E5A48 45%, #072E25 100%)",
  2: "linear-gradient(135deg, #3A3833 0%, #24231F 50%, #121110 100%)",
};

/**
 * The card itself, drawn in CSS. It tilts toward the pointer and a sheen follows it; with reduced motion it stays flat.
 * Tilt is written straight to CSS variables, so moving the pointer never re-renders React.
 */
export function CardVisual({ card, available }: { card: Card; available: number | null }) {
  const ref = useRef<HTMLDivElement>(null);

  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 18}deg`);
    el.style.setProperty("--sx", `${x * 100}%`);
    el.style.setProperty("--sy", `${y * 100}%`);
    el.style.setProperty("--shine", "1");
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--shine", "0");
  };

  return (
    <div className="[perspective:900px]" onPointerMove={move} onPointerLeave={leave}>
      <div ref={ref} role="img" aria-label={`${card.bank} ${card.name}${card.last4 ? ` ending ${card.last4}` : ""}`}
        style={{ background: FACES[card.slot] }}
        className="relative aspect-[1.586] w-full max-w-[380px] animate-pop-in select-none overflow-hidden rounded-2xl p-[clamp(16px,5%,24px)] text-white shadow-[0_24px_48px_-20px_rgba(7,46,37,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] transition-transform duration-300 ease-out [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] [transform-style:preserve-3d]">
        {/* Guilloché-style rings and a moving sheen. */}
        <svg aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-[300px] opacity-[0.13]" viewBox="0 0 200 200" fill="none" stroke="white" strokeWidth="0.6">
          {Array.from({ length: 14 }, (_, i) => <circle key={i} cx="100" cy="100" r={20 + i * 6} />)}
        </svg>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{ opacity: "var(--shine, 0)", background: "radial-gradient(circle at var(--sx,50%) var(--sy,50%), rgba(255,255,255,0.22), transparent 45%)" }} />

        <div className="relative flex h-full flex-col justify-between [transform:translateZ(30px)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[clamp(13px,3.6vw,15px)] font-semibold tracking-[-0.01em]">{card.bank}</div>
              <div className="text-[12px] text-white/60">{card.name}</div>
            </div>
            <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="rotate-90 text-white/70">
              <path d="M8.5 16.5a6 6 0 0 1 0-9M12 19a10 10 0 0 0 0-14M15.5 21.5a14 14 0 0 0 0-19" />
            </svg>
          </div>

          <span aria-hidden="true" className="block h-[clamp(26px,8vw,34px)] w-[clamp(36px,11vw,46px)] rounded-md bg-gradient-to-br from-[#E9D8A6] via-[#C9A75A] to-[#9C7B36] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]" />

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[clamp(13px,3.8vw,16px)] tracking-[0.18em] text-white/90">
                •••• •••• •••• {card.last4 ?? "····"}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-white/50">
                Available <span className="money ml-1 text-[13px] normal-case tracking-normal text-white">{available != null ? taka(available) : "—"}</span>
              </div>
            </div>
            <div className="flex-none text-right text-[13px] font-semibold italic tracking-wide text-white/85">{card.network ?? "CARD"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
