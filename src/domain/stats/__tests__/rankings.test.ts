import { describe, expect, it } from "vitest";

import { asId } from "@/domain/shared/ids";
import type { PlayerId } from "@/domain/shared/ids";

import type {
  BattingAggregate,
  BowlingAggregate,
  FieldingAggregate,
} from "../aggregate";
import {
  MVP_WEIGHTS,
  buildBattingLeaderboard,
  buildBowlingLeaderboard,
  buildFieldingLeaderboard,
  buildMVPInputs,
  computeMVP,
} from "../rankings";

const pid = (n: number): PlayerId => asId<"PlayerId">(`player-${n}`);

const bat = (
  player: PlayerId,
  o: Partial<BattingAggregate> = {},
): BattingAggregate => ({
  player,
  inningsBatted: 1,
  runs: 0,
  ballsFaced: 1,
  fours: 0,
  sixes: 0,
  highestScore: 0,
  notOuts: 0,
  fifties: 0,
  hundreds: 0,
  strikeRate: 0,
  average: null,
  ...o,
});

const bowl = (
  player: PlayerId,
  o: Partial<BowlingAggregate> = {},
): BowlingAggregate => ({
  player,
  inningsBowled: 1,
  ballsBowled: 6,
  runsConceded: 0,
  wickets: 0,
  maidens: 0,
  bestBowling: null,
  economy: 0,
  average: null,
  strikeRate: null,
  ...o,
});

const field = (
  player: PlayerId,
  o: Partial<FieldingAggregate> = {},
): FieldingAggregate => ({
  player,
  catches: 0,
  stumpings: 0,
  runOuts: 0,
  dismissals: 0,
  ...o,
});

describe("buildBattingLeaderboard", () => {
  it("orders by runs desc then strike rate, applies balls-faced threshold", () => {
    const aggs = [
      bat(pid(1), { runs: 50, ballsFaced: 40, strikeRate: 125 }),
      bat(pid(2), { runs: 50, ballsFaced: 25, strikeRate: 200 }), // same runs, higher SR
      bat(pid(3), { runs: 80, ballsFaced: 60, strikeRate: 133 }),
      bat(pid(4), { runs: 999, ballsFaced: 0, strikeRate: 0 }), // below threshold, excluded
    ];
    const board = buildBattingLeaderboard(aggs, 1);
    expect(board.map((e) => e.value.player)).toEqual([pid(3), pid(2), pid(1)]);
    expect(board[0]!.rank).toBe(1);
    expect(board.find((e) => e.value.player === pid(4))).toBeUndefined();
  });
});

describe("buildBowlingLeaderboard", () => {
  it("orders by wickets desc then economy asc", () => {
    const aggs = [
      bowl(pid(1), { wickets: 3, economy: 7, ballsBowled: 24 }),
      bowl(pid(2), { wickets: 3, economy: 4, ballsBowled: 24 }), // same wickets, lower econ wins
      bowl(pid(3), { wickets: 5, economy: 9, ballsBowled: 24 }),
      bowl(pid(4), { wickets: 9, economy: 1, ballsBowled: 0 }), // no legal balls, excluded
    ];
    const board = buildBowlingLeaderboard(aggs, 1);
    expect(board.map((e) => e.value.player)).toEqual([pid(3), pid(2), pid(1)]);
  });

  it("breaks wkts+econ ties by more balls bowled (workhorse) then player id", () => {
    const aggs = [
      // Same wickets and economy: the bowler who bowled MORE balls ranks higher.
      bowl(pid(1), { wickets: 2, economy: 6, ballsBowled: 12 }),
      bowl(pid(2), { wickets: 2, economy: 6, ballsBowled: 24 }),
      // Fully identical to keep the chain total: stable by player id (3 < 4).
      bowl(pid(4), { wickets: 2, economy: 6, ballsBowled: 12 }),
      bowl(pid(3), { wickets: 2, economy: 6, ballsBowled: 12 }),
    ];
    const board = buildBowlingLeaderboard(aggs, 1);
    // pid(2) first (24 balls), then the 12-ball group ordered by id: 1,3,4.
    expect(board.map((e) => e.value.player)).toEqual([pid(2), pid(1), pid(3), pid(4)]);
  });
});

describe("buildFieldingLeaderboard", () => {
  it("orders by dismissals desc and drops zero-dismissal players", () => {
    const aggs = [
      field(pid(1), { catches: 1, dismissals: 1 }),
      field(pid(2), { catches: 2, stumpings: 1, dismissals: 3 }),
      field(pid(3), { dismissals: 0 }), // dropped
    ];
    const board = buildFieldingLeaderboard(aggs);
    expect(board.map((e) => e.value.player)).toEqual([pid(2), pid(1)]);
    expect(board).toHaveLength(2);
  });
});

describe("computeMVP", () => {
  it("blends batting, bowling and fielding into one score and ranks", () => {
    // Player A: pure batter — 100 runs, 10 fours, 2 sixes, 1 hundred.
    const aRuns =
      MVP_WEIGHTS.RUN * 100 +
      MVP_WEIGHTS.BOUNDARY_FOUR * 10 +
      MVP_WEIGHTS.BOUNDARY_SIX * 2 +
      MVP_WEIGHTS.HUNDRED * 1; // 100 + 10 + 4 + 16 = 130
    // Player B: bowler — 5 wickets + 1 maiden + 1 catch.
    const bScore =
      MVP_WEIGHTS.WICKET * 5 +
      MVP_WEIGHTS.MAIDEN * 1 +
      MVP_WEIGHTS.CATCH * 1; // 125 + 4 + 8 = 137

    const result = computeMVP([
      {
        player: pid(1),
        batting: bat(pid(1), { runs: 100, fours: 10, sixes: 2, hundreds: 1 }),
      },
      {
        player: pid(2),
        bowling: bowl(pid(2), { wickets: 5, maidens: 1 }),
        fielding: field(pid(2), { catches: 1, dismissals: 1 }),
      },
    ]);

    expect(result[0]!.player).toBe(pid(2)); // 137 > 130
    expect(result[0]!.points).toBe(bScore);
    expect(result[1]!.points).toBe(aRuns);
    expect(result[0]!.rank).toBe(1);
    expect(result[1]!.rank).toBe(2);
    // Component breakdown is exposed.
    expect(result[1]!.battingPoints).toBe(aRuns);
    expect(result[0]!.bowlingPoints).toBe(125 + 4);
    expect(result[0]!.fieldingPoints).toBe(8);
  });

  it("sums every documented weight component (full all-rounder line)", () => {
    // Exercise every term in the MVP formula at once so the documented formula
    // and the implementation cannot silently drift apart.
    const [r] = computeMVP([
      {
        player: pid(1),
        batting: bat(pid(1), {
          runs: 60,
          fours: 5,
          sixes: 3,
          fifties: 1,
          hundreds: 0,
        }),
        bowling: bowl(pid(1), { wickets: 2, maidens: 1 }),
        fielding: field(pid(1), {
          catches: 1,
          stumpings: 1,
          runOuts: 1,
          dismissals: 3,
        }),
      },
    ]);
    const expectedBatting =
      MVP_WEIGHTS.RUN * 60 +
      MVP_WEIGHTS.BOUNDARY_FOUR * 5 +
      MVP_WEIGHTS.BOUNDARY_SIX * 3 +
      MVP_WEIGHTS.FIFTY * 1;
    const expectedBowling = MVP_WEIGHTS.WICKET * 2 + MVP_WEIGHTS.MAIDEN * 1;
    const expectedFielding =
      MVP_WEIGHTS.CATCH * 1 + MVP_WEIGHTS.STUMPING * 1 + MVP_WEIGHTS.RUN_OUT * 1;
    expect(r!.battingPoints).toBe(expectedBatting);
    expect(r!.bowlingPoints).toBe(expectedBowling);
    expect(r!.fieldingPoints).toBe(expectedFielding);
    expect(r!.points).toBe(expectedBatting + expectedBowling + expectedFielding);
  });

  it("breaks ties deterministically by player id", () => {
    const result = computeMVP([
      { player: pid(2), batting: bat(pid(2), { runs: 10 }) },
      { player: pid(1), batting: bat(pid(1), { runs: 10 }) },
    ]);
    // Equal points -> player-1 sorts before player-2.
    expect(result.map((r) => r.player)).toEqual([pid(1), pid(2)]);
  });
});

describe("buildMVPInputs", () => {
  it("unions player ids across the three aggregate maps", () => {
    const batting = new Map([[pid(1), bat(pid(1), { runs: 20 })]]);
    const bowling = new Map([[pid(2), bowl(pid(2), { wickets: 2 })]]);
    const fielding = new Map([[pid(1), field(pid(1), { catches: 1, dismissals: 1 })]]);

    const inputs = buildMVPInputs(batting, bowling, fielding);
    const ids = inputs.map((i) => i.player).sort();
    expect(ids).toEqual([pid(1), pid(2)]);
    const p1 = inputs.find((i) => i.player === pid(1))!;
    expect(p1.batting?.runs).toBe(20);
    expect(p1.fielding?.catches).toBe(1);
    expect(p1.bowling).toBeUndefined();
  });
});
