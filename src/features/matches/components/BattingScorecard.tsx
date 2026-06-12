import type { BattingCard } from "@/domain/cricket/scorecard";
import type { DismissalType } from "@/domain/cricket/enums";

/**
 * Batting scorecard table. Pure/presentational: it renders the engine-derived
 * `BattingCard[]` and resolves player ids to names via the supplied map so the
 * scorecard reads naturally without coupling the engine to display data.
 */

function dismissalText(
  card: BattingCard,
  names: Map<string, string>,
): string {
  if (!card.isOut || !card.dismissal) return "not out";
  const d = card.dismissal;
  const bowler = d.bowler ? names.get(d.bowler) ?? "bowler" : null;
  const fielder = d.fielders[0] ? names.get(d.fielders[0]) ?? "fielder" : null;

  const map: Partial<Record<DismissalType, string>> = {
    bowled: bowler ? `b ${bowler}` : "bowled",
    lbw: bowler ? `lbw b ${bowler}` : "lbw",
    caught: fielder && bowler ? `c ${fielder} b ${bowler}` : "caught",
    stumped: fielder && bowler ? `st ${fielder} b ${bowler}` : "stumped",
    run_out: fielder ? `run out (${fielder})` : "run out",
    hit_wicket: bowler ? `hit wkt b ${bowler}` : "hit wicket",
  };
  return map[d.type] ?? d.type.replace(/_/g, " ");
}

export function BattingScorecard({
  cards,
  names,
}: {
  cards: BattingCard[];
  names: Map<string, string>;
}) {
  if (cards.length === 0) {
    return (
      <p className="px-1 py-4 text-sm text-muted-foreground">
        No batting yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2 font-medium">Batter</th>
            <th className="px-1 py-2 text-right font-medium">R</th>
            <th className="px-1 py-2 text-right font-medium">B</th>
            <th className="px-1 py-2 text-right font-medium">4s</th>
            <th className="px-1 py-2 text-right font-medium">6s</th>
            <th className="py-2 pl-1 text-right font-medium">SR</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.player} className="border-b border-border/50">
              <td className="py-2 pr-2">
                <div className="font-medium">
                  {names.get(c.player) ?? "Player"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {dismissalText(c, names)}
                </div>
              </td>
              <td className="px-1 py-2 text-right font-semibold tabular-nums">
                {c.runs}
              </td>
              <td className="px-1 py-2 text-right tabular-nums">
                {c.ballsFaced}
              </td>
              <td className="px-1 py-2 text-right tabular-nums">{c.fours}</td>
              <td className="px-1 py-2 text-right tabular-nums">{c.sixes}</td>
              <td className="py-2 pl-1 text-right tabular-nums">
                {c.strikeRate.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
