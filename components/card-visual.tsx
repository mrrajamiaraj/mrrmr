"use client";

import { useId, useRef } from "react";
import type { Card } from "@/lib/types";

/**
 * Card artwork (local SVGs in /public/cards — original illustrations in each bank's verified colours, see
 * docs/CARD_ART.md) with the card's details set as real text on top: bank, product, masked number, cardholder.
 * Balances and due dates are never part of the image; pages show them beside it as text.
 * Only the last four digits are ever shown — the app has no field for a full card number or CVV.
 *
 * Motion (large size only): it floats gently, tilts toward the pointer and a holographic sheen follows it. Pointer
 * position is written straight to CSS variables, so moving never re-renders React. Reduced motion: flat and still.
 */
const ART: Record<string, string> = {
  "city bank": "/cards/city-bank.svg",
  "community bank": "/cards/community-bank.svg",
};

export function cardArt(card: Pick<Card, "bank" | "slot">) {
  return ART[card.bank.trim().toLowerCase()] ?? (card.slot === 1 ? ART["city bank"] : ART["community bank"]);
}

/**
 * The living layer over each card's artwork (same 856×540 frame as the SVGs), like the debit card's turning star:
 * Amex Gold — the medallion's engraved rays turn slowly and a band of light glides across the rose gold;
 * Visa Platinum — glints travel along the silver curves and the same light band glides across.
 * Pure CSS animation (globals.css: card-spin, card-sweep, card-glint); reduced motion stops all of it.
 */
function CardMotion({ art }: { art: string }) {
  const id = useId().replace(/:/g, "");
  const sweep = (
    <g className="card-sweep">
      <rect x="-260" y="-200" width="220" height="940" transform="rotate(20)" fill={`url(#${id}-band)`} />
    </g>
  );
  const band = (
    <linearGradient id={`${id}-band`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.22" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
    </linearGradient>
  );
  if (art === "/cards/city-bank.svg") {
    // Engraved rays behind the wreath, turning slowly inside the medallion (same geometry as city-bank.svg).
    const rays = Array.from({ length: 36 }, (_, i) => {
      const a = (i * Math.PI) / 18;
      return `M330 232 L${(330 + 360 * Math.cos(a)).toFixed(0)} ${(232 + 360 * Math.sin(a)).toFixed(0)}`;
    }).join(" ");
    return (
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 856 540" preserveAspectRatio="none">
        <defs>
          {band}
          <clipPath id={`${id}-oval`}><ellipse cx="268" cy="262" rx="228" ry="300" /></clipPath>
        </defs>
        <g clipPath={`url(#${id}-oval)`}>
          <path d={rays} className="card-spin" style={{ transformOrigin: "330px 232px" }} fill="none" stroke="#4A2E27" strokeOpacity="0.14" strokeWidth="1.4" />
        </g>
        {sweep}
      </svg>
    );
  }
  const curves = ["M210 -20 C 120 160, 160 360, 520 560", "M250 -20 C 170 170, 220 380, 600 560", "M560 -20 C 420 120, 470 330, 900 440"];
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 856 540" preserveAspectRatio="none">
      <defs>{band}</defs>
      {curves.map((d, i) => (
        <path key={d} d={d} pathLength={100} fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth={i === 0 ? 3 : 2} strokeLinecap="round"
          className="card-glint" style={{ animationDelay: `${i * -2.2}s`, filter: "drop-shadow(0 0 4px rgba(255,255,255,0.8))" }} />
      ))}
      {sweep}
    </svg>
  );
}

/** Light artwork (the rose-gold City Bank Amex Gold) takes dark text; the rest take white. */
const LIGHT_ART = new Set(["/cards/city-bank.svg"]);

/** Embossed silver, as on a metal Gold card: light face, dark lower edge, a highlight above. */
const EMBOSS: React.CSSProperties = {
  color: "#F7F2EF",
  textShadow: "0 0.14cqw 0 rgba(70,45,38,0.8), 0 0.3cqw 0.5cqw rgba(70,45,38,0.35), 0 -0.08cqw 0 rgba(255,255,255,0.7)",
};

/**
 * The Amex Gold card's text, laid out like the reference card (positions in % of the card, sizes in container
 * units so it scales with the card): bank as the bold wordmark top-right, product under it, last 4 by the
 * contactless mark, the embossed number across the middle (4-6-5 grouping), and the card name along the bottom.
 */
function GoldText({ card }: { card: Card }) {
  const l4 = card.last4 ?? "····";
  return (
    <div aria-hidden="true" className="absolute inset-0 @container">
      <span className="absolute right-[6%] top-[7%] flex flex-col items-end leading-[0.95] text-[#2A1D1A]">
        <span className="whitespace-nowrap text-[6.4cqw] font-extrabold uppercase tracking-[0.01em]">{card.bank}</span>
        {card.network && <span className="mt-[0.6cqw] whitespace-nowrap text-[3cqw] font-semibold uppercase tracking-[0.18em] opacity-75">{card.network}</span>}
      </span>
      <span className="absolute left-[89%] top-[51%] font-mono text-[3.3cqw] font-semibold leading-none text-[#2A1D1A]">{l4}</span>
      <span className="absolute left-[11%] top-[59%] whitespace-nowrap font-mono text-[5.6cqw] font-light leading-none tracking-[0.08em]" style={EMBOSS}>
        •••• •••••• •{l4}
      </span>
      <span className="absolute bottom-[8%] left-[11%] max-w-[50%] truncate whitespace-nowrap text-[3.8cqw] font-light uppercase leading-none tracking-[0.16em]" style={EMBOSS}>
        {card.name}
      </span>
    </div>
  );
}

export function CardVisual({ card, size = "lg" }: { card: Card; size?: "sm" | "lg" }) {
  const sm = size === "sm";
  const light = LIGHT_ART.has(cardArt(card));
  const ink = light ? "text-[#2E201C]" : "text-white";
  const ink2 = light ? "text-[#2E201C]/80" : "text-white/85";
  const ink3 = light ? "text-[#2E201C]/70" : "text-white/65";
  const shadow = light ? "" : "drop-shadow-sm";
  const ref = useRef<HTMLDivElement>(null);

  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (sm || !el || e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 16}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 22}deg`);
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
    <figure className={`m-0 w-full ${sm ? "" : "card-float"}`} onPointerMove={move} onPointerLeave={leave}>
      <div
        ref={ref}
        role="img"
        aria-label={`${card.bank} ${card.network ?? "credit card"}${card.last4 ? `, card ending ${card.last4}` : ""}`}
        className={`relative aspect-[1.586] w-full select-none overflow-hidden ${ink} ${sm ? "rounded-xl shadow-[0_14px_28px_-16px_rgba(10,13,19,0.7)]" : "card-3d rounded-[20px] shadow-[0_40px_70px_-30px_rgba(10,13,19,0.75),0_8px_20px_-12px_rgba(10,13,19,0.4)]"}`}
        style={{ backgroundImage: `url(${cardArt(card)})`, backgroundSize: "cover" }}
      >
        <CardMotion art={cardArt(card)} />
        {!sm && <span aria-hidden="true" className="card-holo" />}
        {light ? <GoldText card={card} /> : <div aria-hidden="true" className={`absolute inset-0 flex flex-col justify-between ${sm ? "p-3" : "p-[clamp(16px,5.5%,26px)]"}`}>
          <div className="flex items-start justify-between gap-3">
            <span className={`min-w-0 truncate whitespace-nowrap font-semibold tracking-[-0.01em] ${shadow} ${sm ? "text-[11px]" : "text-[clamp(14px,3.8vw,18px)]"}`}>{card.bank}</span>
            {card.network && <span className={`flex-none whitespace-nowrap text-right font-medium ${ink2} ${sm ? "text-[9.5px]" : "text-[clamp(11px,3vw,13px)]"}`}>{card.network}</span>}
          </div>
          <div>
            <div className={`font-mono tracking-[0.18em] ${ink} ${shadow} ${sm ? "text-[11px]" : "text-[clamp(13px,4vw,18px)]"}`}>
              •••• •••• •••• {card.last4 ?? "····"}
            </div>
            {!sm && <div className={`mt-1.5 text-[clamp(10px,2.6vw,12px)] uppercase tracking-[0.14em] ${ink3}`}>{card.name}</div>}
          </div>
        </div>}
      </div>
    </figure>
  );
}
