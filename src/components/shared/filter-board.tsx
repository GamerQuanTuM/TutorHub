"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BoardItem {
  id: string;
  /** Filters this item belongs to (the "all" filter shows everything). */
  tags: string[];
  /** Text the search box matches against. */
  search?: string;
  /** Already-rendered card (server component output). */
  node: React.ReactNode;
}
export interface BoardGroup {
  key: string;
  header?: React.ReactNode;
  items: BoardItem[];
  layout?: "list" | "grid2" | "grid3";
  /** Shown under the header when the group has no items at all and no filter/search is active. */
  emptyNote?: React.ReactNode;
}
export interface BoardFilter {
  id: string; // "all" shows everything
  label: string;
  count: number;
}

const layouts = {
  list: "space-y-3",
  grid2: "grid gap-4 md:grid-cols-2",
  grid3: "grid gap-4 md:grid-cols-2 xl:grid-cols-3",
} as const;

/**
 * Filter pills (with counts) and an optional search box over groups of cards. The cards are rendered on the server and
 * passed in as nodes, so this component only decides which ones to show.
 */
export function FilterBoard({
  filters, groups, searchPlaceholder, emptyAll, className,
}: {
  filters: BoardFilter[];
  groups: BoardGroup[];
  searchPlaceholder?: string;
  emptyAll?: React.ReactNode;
  className?: string;
}) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  const visible = useMemo(
    () => groups.map((g) => ({
      ...g,
      shown: g.items.filter((i) => (filter === "all" || i.tags.includes(filter)) && (!needle || (i.search ?? "").toLowerCase().includes(needle))),
    })),
    [groups, filter, needle],
  );
  const total = visible.reduce((n, g) => n + g.shown.length, 0);
  const idle = filter === "all" && !needle;

  return (
    <div className={cn("space-y-6", className)}>
      {(filters.length > 1 || searchPlaceholder) && (
        <div className="flex flex-wrap items-center gap-3">
          {filters.length > 1 && (
            <div role="group" aria-label="Filter" className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                    filter === f.id ? "border-transparent bg-primary text-primary-foreground shadow-soft" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  {f.label} <span className="mono opacity-80">({f.count})</span>
                </button>
              ))}
            </div>
          )}
          {searchPlaceholder && (
            <div className="relative min-w-52 flex-1 sm:max-w-sm sm:flex-none">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <label className="sr-only" htmlFor="board-search">Search</label>
              <input id="board-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="w-full rounded-full border border-border bg-card py-2.5 pl-10 pr-4 text-sm" />
            </div>
          )}
        </div>
      )}

      {total === 0 && !visible.some((g) => idle && g.emptyNote) ? (
        emptyAll ?? <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Nothing matches. Try another filter or clear the search.</p>
      ) : (
        visible.map((g) => {
          if (g.shown.length === 0 && !(idle && g.emptyNote)) return null;
          return (
            <section key={g.key} className="space-y-3">
              {g.header}
              {g.shown.length === 0 ? g.emptyNote : <ul className={layouts[g.layout ?? "list"]}>{g.shown.map((i) => <li key={i.id} className="min-w-0">{i.node}</li>)}</ul>}
            </section>
          );
        })
      )}
    </div>
  );
}
