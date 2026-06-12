"use client";

import * as React from "react";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PointsTableRow } from "@/server/actions/tournament";

interface PointsTableProps {
  rows: PointsTableRow[];
  isLoading?: boolean;
}

type SortKey = "points" | "won" | "nrr" | "played";

interface SortState {
  key: SortKey;
  desc: boolean;
}

/**
 * PointsTable — horizontally scrollable on mobile.
 *
 * Sorting is client-local: clicking a column header toggles asc/desc.
 * The default sort mirrors the server: points desc → NRR desc.
 */
export function PointsTable({ rows, isLoading }: PointsTableProps) {
  const [sort, setSort] = useState<SortState>({ key: "points", desc: true });

  const sorted = React.useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let aVal: number;
      let bVal: number;
      if (sort.key === "nrr") {
        aVal = parseFloat(a.nrr);
        bVal = parseFloat(b.nrr);
      } else {
        aVal = a[sort.key];
        bVal = b[sort.key];
      }
      const diff = sort.desc ? bVal - aVal : aVal - bVal;
      if (diff !== 0) return diff;
      return a.teamName.localeCompare(b.teamName);
    });
    return copy;
  }, [rows, sort]);

  function handleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, desc: !prev.desc } : { key, desc: true },
    );
  }

  function SortArrow({ col }: { col: SortKey }) {
    if (sort.key !== col) return <span className="opacity-30">↕</span>;
    return <span>{sort.desc ? "↓" : "↑"}</span>;
  }

  const th =
    "whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none hover:text-foreground";
  const thLeft = th + " text-left";
  const td = "whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums";
  const tdLeft = td + " text-left font-medium";

  if (isLoading) {
    return (
      <div className="space-y-2 px-4 py-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        No results yet. Points will appear once matches are completed.
      </p>
    );
  }

  return (
    /* Horizontal scroll wrapper — critical for mobile */
    <div className="overflow-x-auto" role="region" aria-label="Points table">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={cn(thLeft, "w-8 min-w-[2rem]")}>
              #
            </th>
            <th scope="col" className={cn(thLeft, "min-w-[120px]")}>
              Team
            </th>
            <th
              scope="col"
              className={th}
              onClick={() => handleSort("played")}
              aria-sort={
                sort.key === "played"
                  ? sort.desc
                    ? "descending"
                    : "ascending"
                  : "none"
              }
            >
              P <SortArrow col="played" />
            </th>
            <th
              scope="col"
              className={th}
              onClick={() => handleSort("won")}
              aria-sort={
                sort.key === "won"
                  ? sort.desc
                    ? "descending"
                    : "ascending"
                  : "none"
              }
            >
              W <SortArrow col="won" />
            </th>
            <th scope="col" className={th}>
              L
            </th>
            <th scope="col" className={th}>
              T
            </th>
            <th scope="col" className={th}>
              NR
            </th>
            <th
              scope="col"
              className={cn(th, "text-primary")}
              onClick={() => handleSort("points")}
              aria-sort={
                sort.key === "points"
                  ? sort.desc
                    ? "descending"
                    : "ascending"
                  : "none"
              }
            >
              Pts <SortArrow col="points" />
            </th>
            <th
              scope="col"
              className={th}
              onClick={() => handleSort("nrr")}
              aria-sort={
                sort.key === "nrr"
                  ? sort.desc
                    ? "descending"
                    : "ascending"
                  : "none"
              }
            >
              NRR <SortArrow col="nrr" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => (
            <tr
              key={row.teamId}
              className={cn(
                "border-b border-border transition-colors",
                idx % 2 === 0 ? "bg-background" : "bg-muted/30",
                "hover:bg-muted/60",
              )}
            >
              <td className={cn(tdLeft, "text-muted-foreground")}>{idx + 1}</td>
              <td className={tdLeft}>{row.teamName}</td>
              <td className={td}>{row.played}</td>
              <td className={td}>{row.won}</td>
              <td className={td}>{row.lost}</td>
              <td className={td}>{row.tied}</td>
              <td className={td}>{row.noResult}</td>
              <td className={cn(td, "font-bold text-primary")}>{row.points}</td>
              <td
                className={cn(
                  td,
                  parseFloat(row.nrr) >= 0
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {row.nrr}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
