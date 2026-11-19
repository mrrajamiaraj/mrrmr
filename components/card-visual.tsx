import type { Card } from "@/lib/types";

/**
 * Card artwork (local SVGs in /public/cards — original illustrations in each bank's verified colours, see
 * docs/CARD_ART.md) with the card's details set as real text on top: bank, product, masked number, cardholder.
 * Balances and due dates are never part of the image; pages show them beside it as text.
 * Only the last four digits are ever shown — the app has no field for a full card number or CVV.
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
  return (
    <figure className="m-0 w-full">
      <div
        role="img"
        aria-label={`${card.bank} ${card.network ?? "credit card"}${card.last4 ? `, card ending ${card.last4}` : ""}`}
        className={`relative aspect-[1.586] w-full select-none overflow-hidden text-white shadow-[0_22px_44px_-22px_rgba(10,13,19,0.65)] ${sm ? "rounded-xl" : "rounded-[18px]"}`}
        style={{ backgroundImage: `url(${cardArt(card)})`, backgroundSize: "cover" }}
      >
        <div aria-hidden="true" className={`absolute inset-0 flex flex-col justify-between ${sm ? "p-3" : "p-[clamp(16px,5.5%,26px)]"}`}>
          <div className="flex items-start justify-between gap-3">
            <span className={`font-semibold tracking-[-0.01em] ${sm ? "text-[12px]" : "text-[clamp(14px,3.8vw,17px)]"}`}>{card.bank}</span>
            {card.network && <span className={`text-right font-medium text-white/80 ${sm ? "text-[10px]" : "text-[clamp(11px,3vw,13px)]"}`}>{card.network}</span>}
          </div>
          <div>
            <div className={`font-mono tracking-[0.16em] text-white/90 ${sm ? "text-[11px]" : "text-[clamp(13px,4vw,17px)]"}`}>
              •••• •••• •••• {card.last4 ?? "····"}
            </div>
            {!sm && <div className="mt-1.5 text-[clamp(10px,2.6vw,12px)] uppercase tracking-[0.12em] text-white/60">{card.name}</div>}
          </div>
        </div>
      </div>
    </figure>
  );
}
