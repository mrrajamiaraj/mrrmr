/** Shown under the header while a section's data loads: the same shapes as the real page, shimmering. */
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading" className="page-gutter pb-16 pt-5 sm:pb-20 sm:pt-7 lg:pt-10">
      <span className="sr-only" role="status">Loading…</span>
      <div className="mx-auto flex max-w-[1180px] animate-fade-in flex-col gap-5 sm:gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5 sm:pb-6">
          <div className="flex flex-col gap-2.5">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-9 w-64" />
            <div className="skeleton h-4 w-[min(460px,70vw)]" />
          </div>
          <div className="skeleton h-10 w-32 rounded-lg" />
        </div>

        <div className="grid overflow-hidden rounded-xl border border-line bg-surface md:grid-cols-3 [&>*+*]:border-t [&>*+*]:border-line md:[&>*+*]:border-l md:[&>*+*]:border-t-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2.5 px-5 py-4">
              <div className="skeleton h-3.5 w-24" />
              <div className="skeleton h-8 w-36" />
              <div className="skeleton h-3 w-44" />
            </div>
          ))}
        </div>

        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-[0_0_260px] flex-col gap-3 rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2.5">
                <div className="skeleton size-9 rounded-full" />
                <div className="flex flex-col gap-1.5"><div className="skeleton h-3.5 w-28" /><div className="skeleton h-3 w-20" /></div>
              </div>
              <div className="skeleton h-9 w-full" />
              <div className="skeleton h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-col gap-2 px-5 py-4"><div className="skeleton h-4 w-44" /><div className="skeleton h-3 w-72" /></div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 border-t border-soft px-5 py-3.5">
              <div className="skeleton h-3.5 w-24" />
              <div className="skeleton size-7 rounded-full" />
              <div className="skeleton h-3.5 flex-auto" />
              <div className="skeleton h-3.5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
