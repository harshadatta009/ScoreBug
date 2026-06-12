/**
 * Points table computation — pure, engine-free, unit-testable.
 *
 * Approach: we derive runs and overs from the `innings` rows directly (not via
 * the full ball-by-ball reducer) because:
 *  - The ball log can be large and we'd have to fetch O(matches × balls) rows.
 *  - `innings` rows carry `is_complete` and the team's total is already in
 *    the scorecard materialised at innings close.
 *
 * We therefore read innings-level totals from the `balls` table with a simple
 * aggregate: SUM(bat_runs + extra_runs) for runs, COUNT of legal deliveries for
 * overs.  This intentionally mirrors the lightweight approach used by cricket
 * scoreboard sites where full ball-by-ball access is not warranted for a table.
 *
 * NRR formula (ICC standard):
 *   NRR = (team_runs_scored / overs_faced) - (runs_conceded / overs_bowled)
 *
 * Overs are expressed as decimals (e.g. 19.3 overs = 19 + 3/6 = 19.5 in
 * decimal) using the same `oversDecimal` convention as the engine.
 */

export interface TeamResult {
  /** Branded or raw team id string. */
  teamId: string;
  /** Runs the team scored across all innings they batted. */
  runsFor: number;
  /** Legal balls the team faced (divisor for runs-for rate). */
  ballsFaced: number;
  /** Runs conceded (against) — opponent's batting runs. */
  runsAgainst: number;
  /** Legal balls the team bowled (divisor for runs-against rate). */
  ballsBowled: number;
  /** Match result: 'win' | 'loss' | 'tie' | 'no_result'. */
  result: "win" | "loss" | "tie" | "no_result";
}

export interface PointsRow {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  /** Net Run Rate (may be NaN / Infinity when no overs bowled yet). */
  nrr: number;
  /** Runs scored across all innings batted. */
  runsFor: number;
  /** Legal balls faced. */
  ballsFaced: number;
  /** Runs conceded across all innings bowled. */
  runsAgainst: number;
  /** Legal balls bowled. */
  ballsBowled: number;
}

/** Decimal overs: 18 legal balls → 18/6 = 3.0, 19 legal balls → 19/6 ≈ 3.167. */
export function ballsToOversDecimal(legalBalls: number): number {
  return legalBalls / 6;
}

/**
 * Point award per result (ICC T20/ODI league standard):
 *   win      → 2
 *   tie / NR → 1
 *   loss     → 0
 */
export function pointsForResult(result: TeamResult["result"]): number {
  if (result === "win") return 2;
  if (result === "tie" || result === "no_result") return 1;
  return 0;
}

/**
 * Compute the points table from an array of per-match, per-team results.
 *
 * Each completed match contributes TWO `TeamResult` entries (one per side).
 * Returns rows sorted: points desc → NRR desc → team id asc (stable tiebreak).
 */
export function computePointsTable(results: TeamResult[]): PointsRow[] {
  const map = new Map<string, PointsRow>();

  const ensure = (teamId: string): PointsRow => {
    let row = map.get(teamId);
    if (!row) {
      row = {
        teamId,
        played: 0,
        won: 0,
        lost: 0,
        tied: 0,
        noResult: 0,
        points: 0,
        nrr: 0,
        runsFor: 0,
        ballsFaced: 0,
        runsAgainst: 0,
        ballsBowled: 0,
      };
      map.set(teamId, row);
    }
    return row;
  };

  for (const r of results) {
    const row = ensure(r.teamId);
    row.played += 1;
    row.points += pointsForResult(r.result);
    row.runsFor += r.runsFor;
    row.ballsFaced += r.ballsFaced;
    row.runsAgainst += r.runsAgainst;
    row.ballsBowled += r.ballsBowled;
    if (r.result === "win") row.won += 1;
    else if (r.result === "loss") row.lost += 1;
    else if (r.result === "tie") row.tied += 1;
    else row.noResult += 1;
  }

  // Finalise NRR per team after accumulation.
  for (const row of map.values()) {
    const forRate =
      row.ballsFaced > 0 ? row.runsFor / ballsToOversDecimal(row.ballsFaced) : 0;
    const againstRate =
      row.ballsBowled > 0
        ? row.runsAgainst / ballsToOversDecimal(row.ballsBowled)
        : 0;
    row.nrr = forRate - againstRate;
  }

  const rows = [...map.values()];

  // Sort: more points first, then better NRR, then stable by teamId.
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const nrrDiff = (b.nrr ?? 0) - (a.nrr ?? 0);
    if (Math.abs(nrrDiff) > 0.0001) return nrrDiff;
    return a.teamId.localeCompare(b.teamId);
  });

  return rows;
}
