"use client";

import { useSyncExternalStore } from "react";

// True on phone-width screens (the same 640px line as Tailwind's `sm`). The server and the first client render say
// false, so markup matches during hydration; a phone switches right after. Used where a size is computed in script
// (chart heights) rather than set in CSS.
const QUERY = "(max-width: 639.98px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function usePhone() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
