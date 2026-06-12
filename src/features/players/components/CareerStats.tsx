import { BattingStatTable } from "./BattingStatTable";
import { BowlingStatTable } from "./BowlingStatTable";
import type { PlayerStatistics } from "@/lib/repositories/playerRepository";

interface CareerStatsProps {
  stats: PlayerStatistics | null;
}

function FieldingRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function EmptyState({ section }: { section: string }) {
  return (
    <p className="py-4 text-sm text-muted-foreground">
      No {section} statistics recorded yet.
    </p>
  );
}

/**
 * CareerStats — full career statistics panel shown on the public player
 * profile page. Splits into Batting, Bowling and Fielding sections.
 * All empty-state paths are handled individually so a pure bowler still
 * sees their bowling figures even with zero batting innings.
 */
export function CareerStats({ stats }: CareerStatsProps) {
  if (!stats) {
    return (
      <div className="space-y-6">
        {["Batting", "Bowling", "Fielding"].map((s) => (
          <section key={s}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {s}
            </h3>
            <EmptyState section={s.toLowerCase()} />
          </section>
        ))}
      </div>
    );
  }

  const hasBatting = stats.inningsBatted > 0;
  const hasBowling = stats.inningsBowled > 0;
  const hasFielding =
    stats.catches > 0 || stats.stumpings > 0 || stats.runOuts > 0;

  return (
    <div className="space-y-6">
      {/* Batting */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Batting
        </h3>
        {hasBatting ? (
          <BattingStatTable stats={stats} />
        ) : (
          <EmptyState section="batting" />
        )}
      </section>

      {/* Bowling */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Bowling
        </h3>
        {hasBowling ? (
          <BowlingStatTable stats={stats} />
        ) : (
          <EmptyState section="bowling" />
        )}
      </section>

      {/* Fielding */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Fielding
        </h3>
        {hasFielding ? (
          <dl className="grid grid-cols-2 gap-px rounded-lg border bg-muted sm:grid-cols-3">
            <FieldingRow label="Catches" value={stats.catches} />
            <FieldingRow label="Run-outs" value={stats.runOuts} />
            <FieldingRow label="Stumpings" value={stats.stumpings} />
          </dl>
        ) : (
          <EmptyState section="fielding" />
        )}
      </section>
    </div>
  );
}
