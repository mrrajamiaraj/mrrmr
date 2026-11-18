import { useId } from "react";

/**
 * The MRRMR mark: a monogram M on a jade tile. Its right half is drawn in mint and climbs like a rising line —
 * the same gesture as the old R mark, now on the M. Drawn with strokes, not a font, so it is identical here,
 * in the favicon (app/icon.svg) and the Apple icon (app/apple-icon.tsx).
 */
export function BrandMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" className={`flex-none ${className}`}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#16705A" />
          <stop offset="1" stopColor="#0A3E32" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}g)`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="white" strokeOpacity="0.14" />
      <path d="M8.5 23V9.5l7.5 8" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17.5l7.5-8V23" fill="none" stroke="#A8E0C8" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
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
        <span className={`font-display text-[1.45em] tracking-[0.04em] ${light ? "text-white" : "text-ink"}`}>MRRMR</span>
        {tagline && (
          <span className={`mt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] ${light ? "text-white/60" : "text-slate-500"}`}>
            Private finance
          </span>
        )}
      </span>
    </span>
  );
}
