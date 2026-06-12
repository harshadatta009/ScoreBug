import {
  ballsToOvers,
  bowlingAverage,
  bowlingEconomy,
  bowlingStrikeRate,
} from "@/features/players/statsHelpers";
import type { PlayerStatistics } from "@/lib/repositories/playerRepository";

interface BowlingStatTableProps {
  stats: PlayerStatistics;
}

interface StatRow {
  label: string;
  value: string | number;
}

/**
 * BowlingStatTable — renders a two-column grid of bowling career statistics.
 * Derived metrics (economy, average, SR) are computed via pure helpers with
 * explicit division-by-zero guards.
 */
export function BowlingStatTable({ stats }: BowlingStatTableProps) {
  const rows: StatRow[] = [
    { label: "Innings", value: stats.inningsBowled },
    { label: "Overs", value: ballsToOvers(stats.ballsBowled) },
    { label: "Wickets", value: stats.wickets },
    { label: "Runs", value: stats.runsConceded },
    {
      label: "Economy",
      value: bowlingEconomy(stats.runsConceded, stats.ballsBowled),
    },
    {
      label: "Average",
      value: bowlingAverage(stats.runsConceded, stats.wickets),
    },
    {
      label: "Strike Rate",
      value: bowlingStrikeRate(stats.ballsBowled, stats.wickets),
    },
    { label: "Best", value: stats.bestBowling ?? "-" },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px rounded-lg border bg-muted sm:grid-cols-3 lg:grid-cols-4">
      {rows.map(({ label, value }) => (
        <div
          key={label}
          className="flex flex-col gap-0.5 bg-card px-4 py-3"
        >
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-lg font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
