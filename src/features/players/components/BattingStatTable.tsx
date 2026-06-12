import {
  battingAverage,
  battingStrikeRate,
} from "@/features/players/statsHelpers";
import type { PlayerStatistics } from "@/lib/repositories/playerRepository";

interface BattingStatTableProps {
  stats: PlayerStatistics;
}

interface StatRow {
  label: string;
  value: string | number;
}

/**
 * BattingStatTable — renders a two-column grid of batting career statistics.
 * Derived metrics (SR, average) are computed via the pure helper module to
 * avoid repeated division logic and ensure consistent guard-against-zero.
 */
export function BattingStatTable({ stats }: BattingStatTableProps) {
  const rows: StatRow[] = [
    { label: "Matches", value: stats.matches },
    { label: "Innings", value: stats.inningsBatted },
    { label: "Runs", value: stats.runs },
    { label: "Balls", value: stats.ballsFaced },
    {
      label: "Average",
      value: battingAverage(stats.runs, stats.inningsBatted, stats.notOuts),
    },
    {
      label: "Strike Rate",
      value: battingStrikeRate(stats.runs, stats.ballsFaced),
    },
    { label: "Highest Score", value: stats.highestScore },
    { label: "Not Outs", value: stats.notOuts },
    { label: "50s", value: stats.fifties },
    { label: "100s", value: stats.hundreds },
    { label: "4s", value: stats.fours },
    { label: "6s", value: stats.sixes },
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
