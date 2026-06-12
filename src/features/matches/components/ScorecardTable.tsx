import type { InningsScore } from "@/domain/cricket/scorecard";

import { BattingScorecard } from "./BattingScorecard";
import { BowlingScorecard } from "./BowlingScorecard";
import { FallOfWickets } from "./FallOfWickets";
import { PartnershipList } from "./PartnershipList";

/**
 * Full single-innings scorecard: total, batting, extras, bowling, fall of
 * wickets and partnerships. Everything is derived upstream by `reduceInnings`;
 * this component only formats the `InningsScore` for reading.
 */
export function ScorecardTable({
  score,
  battingTeamName,
  names,
}: {
  score: InningsScore;
  battingTeamName: string;
  names: Map<string, string>;
}) {
  const e = score.extras;
  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold">{battingTeamName}</h3>
        <div className="text-right">
          <span className="text-2xl font-bold tabular-nums">
            {score.runs}/{score.wickets}
          </span>
          <span className="ml-2 text-sm text-muted-foreground">
            ({score.oversText} ov, RR {score.runRate.toFixed(2)})
          </span>
        </div>
      </div>

      <BattingScorecard cards={score.battingCards} names={names} />

      <div className="flex items-center justify-between border-y border-border py-2 text-sm">
        <span className="text-muted-foreground">
          Extras{" "}
          <span className="text-xs">
            (w {e.wides}, nb {e.noBalls}, b {e.byes}, lb {e.legByes}
            {e.penalty ? `, p ${e.penalty}` : ""})
          </span>
        </span>
        <span className="font-semibold tabular-nums">{e.total}</span>
      </div>

      <div className="flex items-center justify-between text-base font-bold">
        <span>Total</span>
        <span className="tabular-nums">
          {score.runs}/{score.wickets} ({score.oversText} ov)
        </span>
      </div>

      {score.target !== null && score.runsRequired !== null && (
        <p className="text-sm text-muted-foreground">
          Target {score.target} ·{" "}
          {score.runsRequired > 0
            ? `${score.runsRequired} needed from ${score.ballsRemaining} balls (RRR ${score.requiredRunRate?.toFixed(2)})`
            : "target reached"}
        </p>
      )}

      <BowlingScorecard cards={score.bowlingCards} names={names} />

      <FallOfWickets fow={score.fallOfWickets} names={names} />

      <PartnershipList partnerships={score.partnerships} names={names} />
    </div>
  );
}
