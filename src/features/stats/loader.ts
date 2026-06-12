import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  topFielders,
  topRunScorers,
  topWicketTakers,
  type PlayerBattingStat,
  type PlayerBowlingStat,
  type PlayerFieldingStat,
} from "@/lib/repositories/statsRepository";

import type { StatTabsData } from "./components/StatTabs";
import type { LeaderboardRowVM } from "./types";

/**
 * Server-side assembly of the four leaderboards for the stats hub.
 *
 * Reads the pre-aggregated leaderboards from the repository, resolves player
 * display names in a single batched query (avoiding an N+1), and shapes them
 * into the flat row view models the table components render. The MVP board is
 * derived here from the same three reads so we never round-trip the engine for
 * the hub view — the precise points formula lives in the domain layer and is
 * applied per-row from the cached aggregates.
 *
 * NOTE: the MVP score here is computed from `player_statistics` (which lacks a
 * maidens column), so MVP omits the maiden bonus that the pure-domain
 * `computeMVP` applies to ball-level aggregates. See followups.
 */

const LIMIT = 50;

/** Shorten a uuid for a readable fallback when a name is missing. */
function fallbackName(id: string): string {
  return `Player ${id.slice(0, 8)}`;
}

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("en", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export async function loadLeaderboards(): Promise<StatTabsData> {
  const [batting, bowling, fielding] = await Promise.all([
    topRunScorers(LIMIT),
    topWicketTakers(LIMIT),
    topFielders(LIMIT),
  ]);

  const names = await resolvePlayerNames([
    ...batting.map((b) => b.playerId as string),
    ...bowling.map((b) => b.playerId as string),
    ...fielding.map((f) => f.playerId as string),
  ]);

  const nameOf = (id: string) => names.get(id) ?? fallbackName(id);

  return {
    batting: battingRows(batting, nameOf),
    bowling: bowlingRows(bowling, nameOf),
    fielding: fieldingRows(fielding, nameOf),
    mvp: mvpRows(batting, bowling, fielding, nameOf),
  };
}

function battingRows(
  stats: PlayerBattingStat[],
  nameOf: (id: string) => string,
): LeaderboardRowVM[] {
  return stats
    .filter((s) => s.runs > 0)
    .map((s, i) => ({
      rank: i + 1,
      playerId: s.playerId as string,
      name: nameOf(s.playerId as string),
      metric: fmt(s.runs),
      detail: `${s.matches} mat · SR ${fmt(s.strikeRate, 1)}${
        s.hundreds > 0 ? ` · ${s.hundreds}×100` : ""
      }`,
    }));
}

function bowlingRows(
  stats: PlayerBowlingStat[],
  nameOf: (id: string) => string,
): LeaderboardRowVM[] {
  return stats
    .filter((s) => s.wickets > 0)
    .map((s, i) => ({
      rank: i + 1,
      playerId: s.playerId as string,
      name: nameOf(s.playerId as string),
      metric: fmt(s.wickets),
      detail: `${s.matches} mat · Econ ${fmt(s.economy, 2)}${
        s.bestBowling ? ` · BB ${s.bestBowling}` : ""
      }`,
    }));
}

function fieldingRows(
  stats: PlayerFieldingStat[],
  nameOf: (id: string) => string,
): LeaderboardRowVM[] {
  return stats.map((s, i) => ({
    rank: i + 1,
    playerId: s.playerId as string,
    name: nameOf(s.playerId as string),
    metric: fmt(s.dismissals),
    detail: `${s.catches} ct · ${s.stumpings} st · ${s.runOuts} ro`,
  }));
}

// MVP points weights mirrored from the domain layer for the stats-table source.
// (maidens unavailable here — see module note.)
const MVP = {
  RUN: 1,
  FOUR: 1,
  SIX: 2,
  FIFTY: 8,
  HUNDRED: 16,
  WICKET: 25,
  CATCH: 8,
  STUMPING: 10,
  RUN_OUT: 6,
} as const;

function mvpRows(
  batting: PlayerBattingStat[],
  bowling: PlayerBowlingStat[],
  fielding: PlayerFieldingStat[],
  nameOf: (id: string) => string,
): LeaderboardRowVM[] {
  const points = new Map<string, number>();
  const add = (id: string, p: number) =>
    points.set(id, (points.get(id) ?? 0) + p);

  for (const b of batting) {
    add(
      b.playerId as string,
      MVP.RUN * b.runs +
        MVP.FOUR * b.fours +
        MVP.SIX * b.sixes +
        MVP.FIFTY * b.fifties +
        MVP.HUNDRED * b.hundreds,
    );
  }
  for (const b of bowling) {
    add(b.playerId as string, MVP.WICKET * b.wickets);
  }
  for (const f of fielding) {
    add(
      f.playerId as string,
      MVP.CATCH * f.catches + MVP.STUMPING * f.stumpings + MVP.RUN_OUT * f.runOuts,
    );
  }

  return [...points.entries()]
    .filter(([, p]) => p > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id, p], i) => ({
      rank: i + 1,
      playerId: id,
      name: nameOf(id),
      metric: fmt(p),
      detail: "Impact points",
    }));
}

/**
 * Resolve display names for a set of player ids in one query. `players.id` is
 * the canonical key; we fall back to the linked user's display name only via
 * the player row itself (players carry their own `display_name`).
 */
async function resolvePlayerNames(
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("id, display_name")
    .in("id", unique);

  if (error) throw new Error(`resolvePlayerNames failed: ${error.message}`);
  for (const row of data ?? []) {
    if (row.display_name) out.set(row.id, row.display_name);
  }
  return out;
}
