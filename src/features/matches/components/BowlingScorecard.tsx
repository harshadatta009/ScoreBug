import type { BowlingCard } from "@/domain/cricket/scorecard";

/** Bowling figures table, rendered from the engine-derived `BowlingCard[]`. */
export function BowlingScorecard({
  cards,
  names,
}: {
  cards: BowlingCard[];
  names: Map<string, string>;
}) {
  if (cards.length === 0) {
    return (
      <p className="px-1 py-4 text-sm text-muted-foreground">
        No bowling yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2 font-medium">Bowler</th>
            <th className="px-1 py-2 text-right font-medium">O</th>
            <th className="px-1 py-2 text-right font-medium">M</th>
            <th className="px-1 py-2 text-right font-medium">R</th>
            <th className="px-1 py-2 text-right font-medium">W</th>
            <th className="py-2 pl-1 text-right font-medium">Econ</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.player} className="border-b border-border/50">
              <td className="py-2 pr-2 font-medium">
                {names.get(c.player) ?? "Player"}
              </td>
              <td className="px-1 py-2 text-right tabular-nums">
                {c.oversText}
              </td>
              <td className="px-1 py-2 text-right tabular-nums">{c.maidens}</td>
              <td className="px-1 py-2 text-right tabular-nums">
                {c.runsConceded}
              </td>
              <td className="px-1 py-2 text-right font-semibold tabular-nums">
                {c.wickets}
              </td>
              <td className="py-2 pl-1 text-right tabular-nums">
                {c.economy.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
