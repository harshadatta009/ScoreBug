import { cn } from "@/lib/utils";

import type { LeaderboardRowVM } from "../types";

/**
 * A single ranked row in a leaderboard.
 *
 * Layout is a 3-column grid (rank · player · metric) so every board lines up
 * regardless of name length. The top three ranks get a subtle medal tint to
 * give the board a scannable podium without extra chrome. Mobile-first: the
 * secondary `detail` wraps under the name on narrow screens.
 */
const MEDAL_TINT: Record<number, string> = {
  1: "text-amber-500",
  2: "text-zinc-400",
  3: "text-orange-600",
};

export function LeaderboardRow({ row }: { row: LeaderboardRowVM }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          "w-6 shrink-0 text-center text-sm font-bold tabular-nums",
          MEDAL_TINT[row.rank] ?? "text-muted-foreground",
        )}
        aria-label={`Rank ${row.rank}`}
      >
        {row.rank}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{row.name}</p>
        {row.detail && (
          <p className="truncate text-xs text-muted-foreground">{row.detail}</p>
        )}
      </div>

      <span className="shrink-0 text-right text-base font-semibold tabular-nums">
        {row.metric}
      </span>
    </li>
  );
}
