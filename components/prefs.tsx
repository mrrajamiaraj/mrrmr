"use client";

import { createContext, useContext } from "react";
import { DEFAULT_PREFS, type Prefs } from "@/lib/prefs";

const PrefsContext = createContext<Prefs>(DEFAULT_PREFS);

/** Provided once by the dashboard layout (from the signed-in user's metadata). */
export function PrefsProvider({ value, children }: { value: Prefs; children: React.ReactNode }) {
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  return useContext(PrefsContext);
}
