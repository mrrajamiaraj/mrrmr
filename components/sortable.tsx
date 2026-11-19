"use client";

import { useMemo, useState } from "react";
import { th } from "@/components/debtors/bits";

type Dir = 1 | -1;
export type SortState<K extends string> = { key: K | null; dir: Dir };

/**
 * Click-to-sort for a table. `keys` maps each sortable column to the value it sorts by.
 * Clicking a column sorts it (text A→Z, numbers and dates biggest/newest first), again reverses it, a third time
 * returns to the table's own order.
 */
export function useSort<T, K extends string>(rows: T[], keys: Record<K, (r: T) => string | number | null>) {
  const [sort, setSort] = useState<SortState<K>>({ key: null, dir: 1 });

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const get = keys[sort.key];
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1; // blanks always last
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return c * sort.dir;
    });
    // `keys` is a fresh object each render; the sort only needs to change when the rows or the choice do.
  }, [rows, sort]);

  const toggle = (key: K, textual: boolean) =>
    setSort((s) => {
      const firstDir: Dir = textual ? 1 : -1;
      if (s.key !== key) return { key, dir: firstDir };
      if (s.dir === firstDir) return { key, dir: (-firstDir) as Dir };
      return { key: null, dir: 1 };
    });

  return { sorted, sort, toggle };
}

/** A column header that sorts its table. `text` columns start A→Z; the rest start biggest first. */
export function SortTh<K extends string>({
  k, label, sort, onSort, right = false, text = false,
}: {
  k: K; label: string; sort: SortState<K>; onSort: (k: K, text: boolean) => void; right?: boolean; text?: boolean;
}) {
  const on = sort.key === k;
  const asc = on && sort.dir === 1;
  return (
    <th scope="col" aria-sort={on ? (asc ? "ascending" : "descending") : "none"} className={`${th} ${right ? "text-right" : ""}`}>
      <button type="button" onClick={() => onSort(k, text)} title={`Sort by ${label.toLowerCase()}`}
        className={`group/sort -mx-1.5 inline-flex min-h-6 items-center gap-1 rounded px-1.5 uppercase tracking-[0.04em] hover:bg-soft hover:text-ink ${on ? "text-ink" : ""} ${right ? "flex-row-reverse" : ""}`}>
        {label}
        <svg aria-hidden="true" width="9" height="12" viewBox="0 0 9 12" className="flex-none">
          <path d="M4.5 1 8 5H1z" className={`transition-opacity ${on && asc ? "fill-ink opacity-100" : on ? "fill-current opacity-20" : "fill-current opacity-25 group-hover/sort:opacity-50"}`} />
          <path d="M4.5 11 1 7h7z" className={`transition-opacity ${on && !asc ? "fill-ink opacity-100" : on ? "fill-current opacity-20" : "fill-current opacity-25 group-hover/sort:opacity-50"}`} />
        </svg>
      </button>
    </th>
  );
}
