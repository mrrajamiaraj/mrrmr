import { useId } from "react";

/**
 * The RMR Finance mark: a geometric R on a green tile, its leg in mint like a rising line.
 * Drawn with strokes, not a font, so it is identical here, in the favicon (app/icon.svg) and the Apple icon.
 */
export function BrandMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" className={`flex-none ${className}`}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2E6B52" />
          <stop offset="1" stopColor="#163A2B" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id}g)`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="white" strokeOpacity="0.12" />
      <path d="M11 23V9h5.5a4.5 4.5 0 0 1 0 9H11" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 18l5 5" fill="none" stroke="#9FD9B8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Mark + name. `compact` drops "Finance" on very narrow phones. */
export function Wordmark({ size = 28, light = false, compact = false }: { size?: number; light?: boolean; compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <BrandMark size={size} className="transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-rotate-6 group-hover:scale-105" />
      <span className={`whitespace-nowrap font-semibold tracking-[-0.01em] ${light ? "text-white" : "text-ink"}`}>
        RMR<span className={`font-normal ${light ? "text-mint" : "text-brand-2"} ${compact ? "max-[379px]:hidden" : ""}`}> Finance</span>
      </span>
    </span>
  );
}
