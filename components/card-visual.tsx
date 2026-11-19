"use client";

import { useRef } from "react";
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

export function CardVisual({ card, size = "lg" }: { card: Card; size?: "sm" | "lg" }) {
  const sm = size === "sm";
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
        className={`relative aspect-[1.586] w-full select-none overflow-hidden text-white ${sm ? "rounded-xl shadow-[0_14px_28px_-16px_rgba(10,13,19,0.7)]" : "card-3d rounded-[20px] shadow-[0_40px_70px_-30px_rgba(10,13,19,0.75),0_8px_20px_-12px_rgba(10,13,19,0.4)]"}`}
        style={{ backgroundImage: `url(${cardArt(card)})`, backgroundSize: "cover" }}
      >
        {!sm && <span aria-hidden="true" className="card-holo" />}
        <div aria-hidden="true" className={`absolute inset-0 flex flex-col justify-between ${sm ? "p-3" : "p-[clamp(16px,5.5%,26px)]"}`}>
          <div className="flex items-start justify-between gap-3">
            <span className={`font-semibold tracking-[-0.01em] drop-shadow-sm ${sm ? "text-[12px]" : "text-[clamp(14px,3.8vw,18px)]"}`}>{card.bank}</span>
            {card.network && <span className={`text-right font-medium text-white/85 ${sm ? "text-[10px]" : "text-[clamp(11px,3vw,13px)]"}`}>{card.network}</span>}
          </div>
          <div>
            <div className={`font-mono tracking-[0.18em] text-white/95 drop-shadow-sm ${sm ? "text-[11px]" : "text-[clamp(13px,4vw,18px)]"}`}>
              •••• •••• •••• {card.last4 ?? "····"}
            </div>
            {!sm && <div className="mt-1.5 text-[clamp(10px,2.6vw,12px)] uppercase tracking-[0.14em] text-white/65">{card.name}</div>}
          </div>
        </div>
      </div>
    </figure>
  );
}
