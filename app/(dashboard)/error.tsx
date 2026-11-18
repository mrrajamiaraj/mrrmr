"use client"; // Error boundaries must be Client Components (Next 16: app/…/error.tsx, `retry` re-fetches the segment).

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

/**
 * Shown in place of a page when loading it fails (most often: Supabase unreachable or paused). The sidebar and
 * tab bar stay, so the other sections are still one tap away. In production the message is generic by design
 * (Next hides server error details); the digest matches the server log.
 */
export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

  return (
    <main id="main" className="page-gutter pb-[calc(var(--bottom-nav-h)+40px+env(safe-area-inset-bottom))] pt-8 lg:pb-20 lg:pt-12">
      <div className="mx-auto max-w-[640px]">
        <ErrorState title="This page couldn't load" onRetry={retry} retryLabel="Load again">
          The finance records could not be read just now. Nothing was changed — your data is safe. This is usually a
          brief connection problem with the database; try again in a moment.
          {digest && <span className="mt-2 block font-mono text-[12px] text-slate-500">Reference: {digest}</span>}
        </ErrorState>
      </div>
    </main>
  );
}
