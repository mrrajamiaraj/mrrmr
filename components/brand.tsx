import { useId } from "react";

/**
 * The MRRMR mark: a monogram M on a jade tile. Its right half is drawn in mint and climbs like a rising line —
 * the same gesture as the old R mark, now on the M. Drawn with strokes, not a font, so it is identical here,
 * in the favicon (app/icon.svg) and the Apple icon (app/apple-icon.tsx).
 */
/*
 * Animated (globals.css, "brand-*"): the M draws itself in — white half, then the mint half climbing — a glint of
 * light crosses the tile every few seconds, and a soft mint glow breathes behind the rising stroke.
 * Reduced motion: drawn and still.
 */
export function BrandMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" className={`flex-none overflow-visible ${className}`}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#16705A" />
          <stop offset="1" stopColor="#0A3E32" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.45" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}r`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#A8E0C8" stopOpacity="0.55" /><stop offset="1" stopColor="#A8E0C8" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}c`}><rect width="32" height="32" rx="9" /></clipPath>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}g)`} />
      <g clipPath={`url(#${id}c)`}>
        <circle cx="21" cy="15" r="11" fill={`url(#${id}r)`} className="brand-glow" />
        <rect x="-14" y="-6" width="10" height="44" transform="rotate(20)" fill={`url(#${id}s)`} className="brand-glint" />
      </g>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="white" strokeOpacity="0.14" />
      <path d="M8.5 23V9.5l7.5 8" pathLength={1} fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="brand-draw" />
      <path d="M16 17.5l7.5-8V23" pathLength={1} fill="none" stroke="#A8E0C8" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="brand-draw" style={{ animationDelay: "450ms" }} />
    </svg>
  );
}

/**
 * Mark + MRRMR in the display face. `tagline` adds the small "Private finance" line (sidebar, sign-in).
 * `light` is for dark brand panels.
 */
export function Wordmark({ size = 28, light = false, tagline = false }: { size?: number; light?: boolean; tagline?: boolean; compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark size={size} className="transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-rotate-6 group-hover:scale-105" />
      <span className="flex flex-col leading-none">
        {/* Letters rise in one after another. */}
        <span className={`font-display text-[1.45em] tracking-[0.04em] ${light ? "text-white" : "text-ink"}`}>
          <span className="sr-only">MRRMR</span>
          {"MRRMR".split("").map((ch, i) => (
            <span key={i} aria-hidden="true" className="brand-letter inline-block" style={{ animationDelay: `${150 + i * 70}ms` }}>{ch}</span>
          ))}
        </span>
        {tagline && (
          <span className={`mt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] ${light ? "text-white/60" : "text-slate-500"}`}>
            Private finance
          </span>
        )}
      </span>
    </span>
  );
}
