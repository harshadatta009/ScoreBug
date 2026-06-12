import { Card } from "@/components/ui/card";

import type { LeaderboardRowVM } from "../types";
import { LeaderboardRow } from "./LeaderboardRow";

interface LeaderboardProps {
  rows: LeaderboardRowVM[];
  /** Column header for the primary metric, e.g. "Runs", "Wickets". */
  metricLabel: string;
  /** Shown when there are no qualifying players yet. */
  emptyTitle: string;
  emptyHint: string;
}

/**
 * A ranked leaderboard table.
 *
 * Renders a header row (Player / metric) and a divided list of ranked rows, or
 * a clean empty state when no player qualifies. Kept a Server Component — it is
 * pure presentation over already-resolved row view models.
 */
export function Leaderboard({
  rows,
  metricLabel,
  emptyTitle,
  emptyHint,
}: LeaderboardProps) {
  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-1 px-4 py-12 text-center">
        <p className="font-semibold">{emptyTitle}</p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">
          {emptyHint}
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="w-6 text-center">#</span>
        <span className="flex-1">Player</span>
        <span className="text-right">{metricLabel}</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <LeaderboardRow key={`${row.rank}-${row.playerId}`} row={row} />
        ))}
      </ul>
    </Card>
  );
}
