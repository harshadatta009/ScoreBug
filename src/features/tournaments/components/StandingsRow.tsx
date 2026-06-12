import * as React from "react";

import { cn } from "@/lib/utils";
import type { PointsTableRow } from "@/server/actions/tournament";

interface StandingsRowProps {
  row: PointsTableRow;
  position: number;
  className?: string;
}

/**
 * StandingsRow — a single team row in the standings, designed for use outside
 * the full PointsTable (e.g. a compact top-4 widget on the overview tab).
 */
export function StandingsRow({ row, position, className }: StandingsRowProps) {
  const nrrNum = parseFloat(row.nrr);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5",
        className,
      )}
    >
      <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
        {position}
      </span>
      <span className="flex-1 truncate text-sm font-medium">{row.teamName}</span>
      <div className="flex items-center gap-4 text-xs tabular-nums">
        <span className="text-muted-foreground">
          {row.played}
          <span className="ml-0.5 text-[10px]">P</span>
        </span>
        <span className="font-bold text-primary">{row.points}</span>
        <span
          className={cn(
            "min-w-[52px] text-right",
            nrrNum >= 0
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400",
          )}
        >
          {row.nrr}
        </span>
      </div>
    </div>
  );
}
