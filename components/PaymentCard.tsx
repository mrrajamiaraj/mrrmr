"use client";

// A premium metal payment card drawn entirely with HTML/CSS and inline SVG (no images), so it stays sharp at any size.
// Every length is in container-query units (cqw) of the card's own width: the card looks identical at 280px and 600px.
//
// Safety: the component only ever takes the LAST FOUR digits. It has no prop for a full card number, CVV or PIN, and
// anything passed as last4 that isn't exactly four digits is shown as "····" (never echoed).
// Originality: the brand name is whatever the caller passes; the medallion is an original geometric lotus. No real
// card brand, portrait, emblem or logo is drawn.

import { useId, useRef } from "react";
import { Archivo_Black, Share_Tech_Mono } from "next/font/google";

const wordmarkFont = Archivo_Black({ weight: "400", subsets: ["latin"], display: "swap" });
const ocrFont = Share_Tech_Mono({ weight: "400", subsets: ["latin"], display: "swap" });

export type PaymentCardTheme = "rose-gold" | "platinum" | "graphite" | "gold";

export type PaymentCardProps = {
  /** original product name, e.g. "NOVA RESERVE" — no real card brands */
  brandName: string;
  /** rendered UPPERCASE */
  holderName: string;
  /** ONLY the last 4 digits */
  last4: string;
  /** "MM/YY" */
  expiry: string;
  /** e.g. "22" */
  memberSince: string;
  grouping?: "4-6-5" | "4-4-4-4";
  theme?: PaymentCardTheme;
  /** tilt + sheen on hover (default true) */
  interactive?: boolean;
};

/** Theme tokens as CSS variables (--metal-1..4, --medallion, --ink, --emboss-light, --emboss-dark, plus a few extras). */
const THEMES: Record<PaymentCardTheme, Record<string, string>> = {
  "rose-gold": {
    "--metal-1": "#e8c8bf", "--metal-2": "#c9a196", "--metal-3": "#b88a80", "--metal-4": "#dcbab0",
    "--medallion": "#a9796e", "--medallion-hi": "#c99d91", "--engrave": "#4a2c25", "--ink": "#1a1a1a",
    "--emboss-face": "#f1dcd5", "--emboss-light": "rgba(255,255,255,.45)", "--emboss-dark": "rgba(0,0,0,.25)",
    "--chip-1": "#f4e3b5", "--chip-2": "#c9a65e", "--chip-3": "#efdcaa", "--ribbon": "#ecd2c9",
  },
  platinum: {
    "--metal-1": "#e9ecef", "--metal-2": "#ced4da", "--metal-3": "#adb5bd", "--metal-4": "#dee2e6",
    "--medallion": "#9aa2ab", "--medallion-hi": "#c3c9cf", "--engrave": "#2b3036", "--ink": "#1a1a1a",
    "--emboss-face": "#f3f5f7", "--emboss-light": "rgba(255,255,255,.5)", "--emboss-dark": "rgba(0,0,0,.28)",
    "--chip-1": "#fafbfc", "--chip-2": "#b9bfc7", "--chip-3": "#eef0f3", "--ribbon": "#e7eaed",
  },
  graphite: {
    "--metal-1": "#3a3a3c", "--metal-2": "#2c2c2e", "--metal-3": "#1c1c1e", "--metal-4": "#333336",
    "--medallion": "#18181a", "--medallion-hi": "#2a2a2d", "--engrave": "#c9c9cf", "--ink": "#f2f2f4",
    "--emboss-face": "#d8d8dd", "--emboss-light": "rgba(255,255,255,.14)", "--emboss-dark": "rgba(0,0,0,.6)",
    "--chip-1": "#e8e9ec", "--chip-2": "#9a9ea6", "--chip-3": "#d4d6da", "--ribbon": "#2f2f32",
  },
  gold: {
    "--metal-1": "#f3d98b", "--metal-2": "#e2c171", "--metal-3": "#c9a14a", "--metal-4": "#ecd291",
    "--medallion": "#b38c3c", "--medallion-hi": "#d6b25f", "--engrave": "#4a3812", "--ink": "#1a1a1a",
    "--emboss-face": "#fbecc0", "--emboss-light": "rgba(255,255,255,.5)", "--emboss-dark": "rgba(0,0,0,.25)",
    "--chip-1": "#f6ecc8", "--chip-2": "#c3a052", "--chip-3": "#efdfa8", "--ribbon": "#f3e2a9",
  },
};

// ---- static geometry (856 × 540 = ID-1 proportions) ------------------------------------------------------------------

const W = 856, H = 540;

/** Two families of interlocking sine waves over the right half, like banknote engraving. */
const GUILLOCHE = (() => {
  const out: string[] = [];
  for (let fam = 0; fam < 2; fam++) {
    for (let j = 0; j < 30; j++) {
      const y0 = -10 + j * 19;
      let d = "";
      for (let x = 420; x <= W + 12; x += 6) {
        const y = y0 + 9 * Math.sin(x / 22 + j * 0.6 + fam * Math.PI) + 5 * Math.sin(x / 57 + fam);
        d += `${d ? " L" : "M"}${x} ${y.toFixed(1)}`;
      }
      out.push(d);
    }
  }
  return out;
})();

/** An original geometric lotus: a fan of hatched petals, two side leaves, a bowl and a centre rosette. */
const PETAL = "M0 0 C -26 -40, -22 -88, 0 -118 C 22 -88, 26 -40, 0 0 Z";
const PETALS = [-64, -32, 0, 32, 64].map((a) => ({ a, s: a === 0 ? 1 : Math.abs(a) === 32 ? 0.9 : 0.78 }));
const RAYS = Array.from({ length: 24 }, (_, i) => {
  const a = (i * Math.PI) / 12;
  return `M0 0 L${(170 * Math.cos(a)).toFixed(1)} ${(170 * Math.sin(a)).toFixed(1)}`;
}).join(" ");

function maskNumber(last4: string, grouping: "4-6-5" | "4-4-4-4") {
  return grouping === "4-4-4-4" ? `•••• •••• •••• ${last4}` : `•••• •••••• •${last4}`;
}

/** Brand name in two stacked lines (split at the middle word boundary). */
function twoLines(name: string): [string, string | null] {
  const words = name.trim().toUpperCase().split(/\s+/);
  if (words.length < 2) return [words[0] ?? "", null];
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(" "), words.slice(half).join(" ")];
}

export function PaymentCard({
  brandName, holderName, last4, expiry, memberSince, grouping = "4-6-5", theme = "rose-gold", interactive = true,
}: PaymentCardProps) {
  const uid = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const l4 = /^\d{4}$/.test(last4) ? last4 : "····";
  const exp = /^\d{2}\/\d{2}$/.test(expiry) ? expiry : "··/··";
  const [line1, line2] = twoLines(brandName);
  const micro = Array(14).fill(brandName.toUpperCase()).join("  ·  ");

  const still = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!interactive || !el || e.pointerType !== "mouse" || still()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${((x - 0.5) * 20).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${((0.5 - y) * 20).toFixed(2)}deg`);
    // The sheen moves opposite to the tilt.
    el.style.setProperty("--sheen-x", `${((1 - x) * 100).toFixed(1)}%`);
    el.style.setProperty("--sheen-y", `${((1 - y) * 100).toFixed(1)}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--sheen-x", "50%");
    el.style.setProperty("--sheen-y", "50%");
  };

  const emboss: React.CSSProperties = { color: "var(--emboss-face)", textShadow: "1px 1px 0 var(--emboss-dark), -1px -1px 0 var(--emboss-light)" };

  return (
    // The wrapper is the size container (so cqw = 1% of the card's width) and supplies the 3D perspective.
    <div className="w-full [container-type:inline-size] [perspective:1000px]">
      <div
        ref={ref}
        role="img"
        aria-label={`${brandName} card ending in ${l4}, expires ${exp}`}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className={`relative w-full select-none overflow-hidden [transform-style:preserve-3d] ${interactive ? "transition-transform duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)] [@media(hover:none)]:active:scale-[0.98] motion-reduce:!transform-none" : ""}`}
        style={{
          ...THEMES[theme],
          aspectRatio: "85.6 / 53.98",
          borderRadius: "3.7cqw",
          transform: interactive ? "rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))" : undefined,
          background: "linear-gradient(120deg, var(--metal-1) 0%, var(--metal-2) 35%, var(--metal-3) 68%, var(--metal-4) 100%)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,.35), 0 20px 40px -12px rgba(0,0,0,.35)",
        } as React.CSSProperties}
      >
        {/* 1b. Brushed-metal texture */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0"
          style={{ background: "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,.03) 0 1px, transparent 1px 4px)" }} />

        {/* 2–4, 6, 7, 10: guilloche, microtext, medallion, chip, contactless and ribbon in one 856×540 frame. */}
        <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full">
          <defs>
            <radialGradient id={`${uid}-med`} cx="0.55" cy="0.42" r="0.75">
              <stop offset="0" style={{ stopColor: "var(--medallion-hi)" }} />
              <stop offset="1" style={{ stopColor: "var(--medallion)" }} />
            </radialGradient>
            <pattern id={`${uid}-hatch`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
              <path d="M0 0 V4" style={{ stroke: "var(--engrave)" }} strokeOpacity="0.22" strokeWidth="0.9" />
            </pattern>
            <pattern id={`${uid}-hatch2`} width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
              <path d="M0 0 V3.2" style={{ stroke: "var(--engrave)" }} strokeOpacity="0.45" strokeWidth="0.8" />
            </pattern>
            <linearGradient id={`${uid}-chip`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: "var(--chip-1)" }} />
              <stop offset="0.5" style={{ stopColor: "var(--chip-2)" }} />
              <stop offset="0.75" style={{ stopColor: "var(--chip-3)" }} />
              <stop offset="1" style={{ stopColor: "var(--chip-2)" }} />
            </linearGradient>
            <filter id={`${uid}-inset`} x="-10%" y="-10%" width="120%" height="120%">
              <feOffset dx="0" dy="1.5" /><feGaussianBlur stdDeviation="1.6" result="b" />
              <feComposite in="SourceGraphic" in2="b" operator="arithmetic" k2="-1" k3="1" result="shadow" />
              <feFlood floodColor="#000" floodOpacity="0.35" /><feComposite in2="shadow" operator="in" />
              <feComposite in2="SourceGraphic" operator="over" />
            </filter>
            <clipPath id={`${uid}-oval`}><ellipse cx="226" cy="270" rx="163" ry="300" /></clipPath>
            <path id={`${uid}-ring1`} d="M490 270 a170 120 0 1 1 340 0 a170 120 0 1 1 -340 0" />
            <path id={`${uid}-ring2`} d="M455 270 a205 150 0 1 1 410 0 a205 150 0 1 1 -410 0" />
          </defs>

          {/* 2. Guilloche */}
          <g fill="none" style={{ stroke: "var(--engrave)" }} strokeOpacity="0.1" strokeWidth="0.4" vectorEffect="non-scaling-stroke">
            {GUILLOCHE.map((d, i) => <path key={i} d={d} vectorEffect="non-scaling-stroke" />)}
          </g>

          {/* 3. Microtext band */}
          <g opacity="0.08" style={{ fill: "var(--engrave)" }} fontSize="7" letterSpacing="1" fontFamily="ui-sans-serif, system-ui, sans-serif">
            <text><textPath href={`#${uid}-ring1`}>{micro}</textPath></text>
            <text><textPath href={`#${uid}-ring2`}>{micro}</textPath></text>
          </g>

          {/* 4. Engraved medallion: double ring, hatched body, original lotus emblem */}
          <ellipse cx="226" cy="270" rx="179" ry="316" fill="none" style={{ stroke: "var(--engrave)" }} strokeOpacity="0.45" strokeWidth="2" />
          <ellipse cx="226" cy="270" rx="171" ry="308" fill="none" style={{ stroke: "var(--engrave)" }} strokeOpacity="0.55" strokeWidth="5" />
          <ellipse cx="226" cy="270" rx="163" ry="300" fill={`url(#${uid}-med)`} />
          <g clipPath={`url(#${uid}-oval)`}>
            <rect x="60" y="-40" width="340" height="620" fill={`url(#${uid}-hatch)`} />
            <path d={RAYS} transform="translate(248 236)" fill="none" style={{ stroke: "var(--engrave)" }} strokeOpacity="0.14" strokeWidth="1" />
            {[64, 104, 140].map((r) => <circle key={r} cx="248" cy="236" r={r} fill="none" style={{ stroke: "var(--engrave)" }} strokeOpacity="0.16" strokeWidth="1" strokeDasharray={r === 140 ? "2 4" : undefined} />)}
          </g>
          <g transform="translate(248 250)">
            {[-1, 1].map((sd) => (
              <path key={sd} d={PETAL} transform={`rotate(${sd * 104}) scale(0.62 0.75)`} fill={`url(#${uid}-hatch2)`} style={{ stroke: "var(--engrave)" }} strokeOpacity="0.7" strokeWidth="2" />
            ))}
            {PETALS.map(({ a, s }) => (
              <g key={a} transform={`rotate(${a}) scale(${s})`}>
                <path d={PETAL} style={{ fill: "var(--medallion-hi)" }} />
                <path d={PETAL} fill={`url(#${uid}-hatch2)`} style={{ stroke: "var(--engrave)" }} strokeOpacity="0.75" strokeWidth="2" />
                <path d="M0 -8 V-104" style={{ stroke: "var(--engrave)" }} strokeOpacity="0.5" strokeWidth="1.2" />
              </g>
            ))}
            <path d="M-96 4 Q 0 58 96 4" fill="none" style={{ stroke: "var(--engrave)" }} strokeOpacity="0.7" strokeWidth="2.4" />
            <path d="M-78 16 Q 0 64 78 16" fill="none" style={{ stroke: "var(--engrave)" }} strokeOpacity="0.45" strokeWidth="1.4" />
            <circle r="15" style={{ fill: "var(--medallion-hi)", stroke: "var(--engrave)" }} strokeOpacity="0.75" strokeWidth="2" />
            <circle r="6" style={{ fill: "var(--engrave)" }} fillOpacity="0.55" />
          </g>

          {/* 6. EMV chip with contact pads and a soft inner shadow */}
          <g transform="translate(77 186)" filter={`url(#${uid}-inset)`}>
            <rect width="103" height="80" rx="13" fill={`url(#${uid}-chip)`} />
            <g fill="none" stroke="#000" strokeOpacity="0.32" strokeWidth="1.6">
              <path d="M0 27 H34 M69 27 H103 M0 53 H34 M69 53 H103" />
              <path d="M34 0 C 42 14, 42 66, 34 80 M69 0 C 61 14, 61 66, 69 80" />
              <rect x="34" y="27" width="35" height="26" rx="5" />
            </g>
          </g>

          {/* 7. Contactless: four nested arcs */}
          <g transform="translate(662 248)" fill="none" style={{ stroke: "var(--ink)" }} strokeOpacity="0.85" strokeWidth="4" strokeLinecap="round">
            {[0, 1, 2, 3].map((k) => <path key={k} d={`M${k * 10} ${10 - k * 6} a ${16 + k * 10} ${16 + k * 10} 0 0 1 0 ${16 + k * 12}`} />)}
          </g>

          {/* 10. MEMBER SINCE ribbon with folded tails */}
          <g transform="translate(514 378)">
            <path d="M0 12 L24 0 V38 L0 50 L12 30 Z" style={{ fill: "var(--ribbon)", stroke: "var(--ink)" }} strokeOpacity="0.75" strokeWidth="1.6" />
            <path d="M274 12 L250 0 V38 L274 50 L262 30 Z" style={{ fill: "var(--ribbon)", stroke: "var(--ink)" }} strokeOpacity="0.75" strokeWidth="1.6" />
            <path d="M24 0 C 90 -10, 184 12, 250 0 V38 C 184 50, 90 28, 24 38 Z" style={{ fill: "var(--ribbon)", stroke: "var(--ink)" }} strokeOpacity="0.85" strokeWidth="1.8" />
            <text x="137" y="26" textAnchor="middle" fontSize="16" letterSpacing="3.2" fontFamily="Georgia, 'Times New Roman', serif"
              style={{ fill: "var(--ink)", fontVariant: "small-caps" }}>Member Since</text>
          </g>
        </svg>

        {/* 5. Wordmark */}
        <div aria-hidden="true" className={`${wordmarkFont.className} absolute right-[6%] top-[7%] text-right uppercase leading-[0.95]`}
          style={{ color: "var(--ink)", fontSize: "5.8cqw", letterSpacing: "0.01em" }}>
          <div>{line1}</div>{line2 && <div>{line2}</div>}
        </div>

        {/* 7b. Card ID by the contactless mark */}
        <div aria-hidden="true" className={`${ocrFont.className} absolute left-[83.5%] top-[46%] leading-none`} style={{ color: "var(--ink)", fontSize: "3.4cqw" }}>{l4}</div>

        {/* 8. Embossed number */}
        <div aria-hidden="true" className={`${ocrFont.className} absolute left-[9%] top-[56.5%] whitespace-nowrap leading-none`}
          style={{ ...emboss, fontSize: "5.6cqw", letterSpacing: "0.06em" }}>
          {maskNumber(l4, grouping)}
        </div>

        {/* 9. Valid thru, expiry, holder */}
        <div aria-hidden="true" className="absolute left-[9%] top-[70.5%] font-semibold uppercase leading-none" style={{ color: "var(--ink)", fontSize: "1.45cqw", letterSpacing: "0.08em", opacity: 0.8 }}>Valid Thru</div>
        <div aria-hidden="true" className={`${ocrFont.className} absolute left-[9%] top-[74%] leading-none`} style={{ ...emboss, fontSize: "3.8cqw", letterSpacing: "0.06em" }}>{exp}</div>
        <div aria-hidden="true" className={`${ocrFont.className} absolute bottom-[7%] left-[9%] max-w-[52%] truncate whitespace-nowrap uppercase leading-none`}
          style={{ ...emboss, fontSize: "3.6cqw", letterSpacing: "0.12em" }}>{holderName}</div>

        {/* 10b. Member-since year under the ribbon */}
        <div aria-hidden="true" className={`${ocrFont.className} absolute left-[76%] top-[80.5%] -translate-x-1/2 leading-none`} style={{ ...emboss, fontSize: "3.8cqw" }}>{memberSince}</div>

        {/* 11. Glossy highlight that follows the cursor (moving opposite to the tilt) */}
        <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${interactive ? "transition-[background-position] duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:![background-position:50%_50%]" : ""}`}
          style={{
            background: "linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,.18) 50%, rgba(255,255,255,0) 70%)",
            backgroundSize: "250% 250%",
            backgroundPosition: "var(--sheen-x, 50%) var(--sheen-y, 50%)",
          }} />
      </div>
    </div>
  );
}

export default PaymentCard;
