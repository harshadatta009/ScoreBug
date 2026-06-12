/**
 * Pure stat-derivation helpers for career statistics display.
 *
 * All guards against division-by-zero are explicit so derived stats always
 * return a display-ready string. These functions are framework-agnostic and
 * trivially unit-testable.
 */

/** Format a number to `dp` decimal places, or return a fallback string. */
function fmt(n: number, dp = 2): string {
  return n.toFixed(dp);
}

// ─── Batting ─────────────────────────────────────────────────────────────────

/**
 * Batting strike rate = (runs / balls_faced) * 100.
 * Returns "-" when balls_faced === 0.
 */
export function battingStrikeRate(
  runs: number,
  ballsFaced: number,
): string {
  if (ballsFaced === 0) return "-";
  return fmt((runs / ballsFaced) * 100, 2);
}

/**
 * Batting average = runs / (innings - not_outs).
 * Conventionally shown as "DNO" (did not out) when all innings were not-outs.
 * Returns "-" when innings === 0.
 */
export function battingAverage(
  runs: number,
  innings: number,
  notOuts: number,
): string {
  if (innings === 0) return "-";
  const outs = innings - notOuts;
  if (outs === 0) return "N/O"; // all innings not out — undefined average
  return fmt(runs / outs, 2);
}

// ─── Bowling ─────────────────────────────────────────────────────────────────

/**
 * Convert total balls bowled to overs display (e.g. 65 balls → "10.5").
 */
export function ballsToOvers(balls: number, ballsPerOver = 6): string {
  const fullOvers = Math.floor(balls / ballsPerOver);
  const remainder = balls % ballsPerOver;
  return remainder === 0 ? `${fullOvers}` : `${fullOvers}.${remainder}`;
}

/**
 * Bowling economy = runs_conceded / overs_bowled.
 * Returns "-" when no balls bowled.
 */
export function bowlingEconomy(
  runsConceded: number,
  ballsBowled: number,
  ballsPerOver = 6,
): string {
  if (ballsBowled === 0) return "-";
  const overs = ballsBowled / ballsPerOver;
  return fmt(runsConceded / overs, 2);
}

/**
 * Bowling average = runs_conceded / wickets.
 * Returns "-" when wickets === 0.
 */
export function bowlingAverage(
  runsConceded: number,
  wickets: number,
): string {
  if (wickets === 0) return "-";
  return fmt(runsConceded / wickets, 2);
}

/**
 * Bowling strike rate = balls_bowled / wickets.
 * Returns "-" when wickets === 0.
 */
export function bowlingStrikeRate(
  ballsBowled: number,
  wickets: number,
): string {
  if (wickets === 0) return "-";
  return fmt(ballsBowled / wickets, 2);
}
