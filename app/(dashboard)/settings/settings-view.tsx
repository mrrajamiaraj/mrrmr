"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { SectionCard, SectionHead } from "@/components/debtors/bits";
import { ThemeSegment } from "@/components/theme";
import { usePrefs } from "@/components/prefs";
import { Button } from "@/components/ui";
import { toast } from "@/components/toast";
import { savePrefs } from "@/lib/actions";
import { LANDING_PAGES, type Prefs } from "@/lib/prefs";
import { taka, takaExact } from "@/lib/format";

/** Personal preferences. Saved to your account (not to any financial record), so they follow you across devices. */
export function SettingsView() {
  const saved = usePrefs();
  const router = useRouter();
  const [p, setP] = useState<Prefs>(saved);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const dirty = JSON.stringify(p) !== JSON.stringify(saved);
  const sel = "field-input max-w-[320px]";

  return (
    <Shell subtitle="How MRRMR looks and opens for you. These never change any financial record.">
      <SectionCard labelledBy="ap-h">
        <SectionHead id="ap-h" title="Appearance" sub="Theme is stored on this device; T switches it anywhere." />
        <div className="flex flex-col gap-5 border-t border-line p-4 sm:p-5">
          <div className="max-w-[420px]"><ThemeSegment stacked /></div>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="field-label mb-1">Table density</legend>
            {(["comfortable", "compact"] as const).map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-2.5 text-[14px]">
                <input type="radio" name="density" checked={p.density === d} onChange={() => setP({ ...p, density: d })} className="size-[18px] accent-brand-2" />
                {d === "comfortable" ? "Comfortable — easier to scan and tap" : "Compact — more rows on screen"}
              </label>
            ))}
          </fieldset>
          <label className="flex cursor-pointer items-start gap-2.5 text-[14px]">
            <input type="checkbox" checked={p.paisa} onChange={() => setP({ ...p, paisa: !p.paisa })} className="mt-0.5 size-[18px] accent-brand-2" />
            <span>Show paisa on figures<span className="block text-[12.5px] text-slate-500">e.g. {takaExact(1433450.5)} instead of {taka(1433450.5)}. Calculations are always exact either way.</span></span>
          </label>
        </div>
      </SectionCard>

      <SectionCard labelledBy="nav-h">
        <SectionHead id="nav-h" title="Start-up and defaults" />
        <div className="flex flex-col gap-4 border-t border-line p-4 sm:p-5">
          <label className="field-label">Open this page when I visit MRRMR
            <select value={p.landing} onChange={(e) => setP({ ...p, landing: e.target.value as Prefs["landing"] })} className={sel}>
              {LANDING_PAGES.map(([href, name]) => <option key={href} value={href}>{name}</option>)}
            </select>
          </label>
        </div>
      </SectionCard>

      {error && <div role="alert" className="text-[13.5px] font-medium text-bad">{error}</div>}
      <div className="flex gap-2">
        <Button disabled={!dirty} pending={pending} pendingLabel="Saving…" onClick={() => start(async () => {
          const r = await savePrefs(p);
          if (r.error) return setError(r.error);
          toast("Preferences saved."); router.refresh();
        })}>Save preferences</Button>
        {dirty && <Button variant="ghost" onClick={() => setP(saved)}>Discard changes</Button>}
      </div>
    </Shell>
  );
}
