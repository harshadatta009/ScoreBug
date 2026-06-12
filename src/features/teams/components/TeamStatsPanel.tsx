import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TeamStatistics } from "@/lib/repositories/teamRepository";

interface TeamStatsPanelProps {
  stats: TeamStatistics;
}

/**
 * TeamStatsPanel — win/loss record and key batting/bowling aggregates.
 *
 * Deliberately simple: stat cards in a responsive grid. No charts to keep the
 * bundle lightweight and this component server-renderable.
 */
export function TeamStatsPanel({ stats }: TeamStatsPanelProps) {
  const winRate =
    stats.matches > 0
      ? ((stats.wins / stats.matches) * 100).toFixed(1)
      : "—";

  const runRate =
    stats.ballsFaced > 0
      ? ((stats.runsFor / stats.ballsFaced) * 6).toFixed(2)
      : "—";

  const economyRate =
    stats.ballsBowled > 0
      ? ((stats.runsAgainst / stats.ballsBowled) * 6).toFixed(2)
      : "—";

  const items: { label: string; value: string | number }[] = [
    { label: "Matches", value: stats.matches },
    { label: "Wins", value: stats.wins },
    { label: "Losses", value: stats.losses },
    { label: "Ties", value: stats.ties },
    { label: "No result", value: stats.noResults },
    { label: "Win rate", value: stats.matches > 0 ? `${winRate}%` : "—" },
    { label: "Runs scored", value: stats.runsFor },
    { label: "Runs conceded", value: stats.runsAgainst },
    { label: "Run rate", value: runRate },
    { label: "Economy", value: economyRate },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(({ label, value }) => (
        <Card key={label} className="text-center">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 pt-0">
            <p className="text-2xl font-bold tabular-nums">{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TeamStatsPanelSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="text-center">
          <CardHeader className="pb-1 pt-3">
            <Skeleton className="mx-auto h-3 w-16" />
          </CardHeader>
          <CardContent className="pb-3 pt-0">
            <Skeleton className="mx-auto h-8 w-12" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
