import { describe, it, expect } from "vitest";
import { reduceInnings } from "../reducer";
import {
  baseConfig,
  rules,
  sequence,
  wicket,
  pid,
  STRIKER,
  NON_STRIKER,
  BOWLER,
} from "./fixtures";

const R = rules();

describe("dismissals & bowler crediting", () => {
  it("credits the bowler for bowled/caught/lbw/stumped/hit_wicket", () => {
    const credited = [
      "bowled",
      "caught",
      "lbw",
      "stumped",
      "hit_wicket",
    ] as const;
    for (const type of credited) {
      const out = pid(1);
      const balls = sequence([
        { wicket: wicket(type, out, BOWLER, type === "caught" ? [pid(7)] : []) },
      ]);
      const s = reduceInnings(baseConfig(), R, balls);
      expect(s.wickets).toBe(1);
      const b = s.bowlingCards.find((x) => x.player === BOWLER);
      expect(b?.wickets).toBe(1);
      const bat = s.battingCards.find((x) => x.player === out);
      expect(bat?.isOut).toBe(true);
      expect(bat?.dismissal?.type).toBe(type);
    }
  });

  it("does NOT credit the bowler for run_out (still a team wicket)", () => {
    const balls = sequence([
      { batRuns: 1, wicket: wicket("run_out", NON_STRIKER, null, [pid(7)]) },
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    expect(s.wickets).toBe(1);
    const b = s.bowlingCards.find((x) => x.player === BOWLER);
    expect(b?.wickets).toBe(0);
    const bat = s.battingCards.find((x) => x.player === NON_STRIKER);
    expect(bat?.isOut).toBe(true);
  });

  it("does NOT credit obstructing_field / hit_ball_twice to the bowler", () => {
    for (const type of ["obstructing_field", "hit_ball_twice"] as const) {
      const balls = sequence([{ wicket: wicket(type, STRIKER, null) }]);
      const s = reduceInnings(baseConfig(), R, balls);
      expect(s.wickets).toBe(1);
      const b = s.bowlingCards.find((x) => x.player === BOWLER);
      expect(b?.wickets).toBe(0);
    }
  });

  it("retired_hurt is not out: no wicket, batter not dismissed", () => {
    const balls = sequence([
      { batRuns: 6 },
      { wicket: wicket("retired_hurt", STRIKER, null) },
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    expect(s.wickets).toBe(0);
    const bat = s.battingCards.find((x) => x.player === STRIKER);
    expect(bat?.isOut).toBe(false);
    // dismissal record is captured for display but does not flag out.
    expect(bat?.dismissal?.type).toBe("retired_hurt");
  });

  it("retired_out IS out and counts as a wicket but not credited to bowler", () => {
    const balls = sequence([{ wicket: wicket("retired_out", STRIKER, null) }]);
    const s = reduceInnings(baseConfig(), R, balls);
    expect(s.wickets).toBe(1);
    const b = s.bowlingCards.find((x) => x.player === BOWLER);
    expect(b?.wickets).toBe(0);
  });

  it("records fall of wickets with score and over", () => {
    const balls = sequence([
      { batRuns: 4 },
      { batRuns: 0, wicket: wicket("bowled", STRIKER, BOWLER) },
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    expect(s.fallOfWickets).toHaveLength(1);
    expect(s.fallOfWickets[0]?.wicketNumber).toBe(1);
    expect(s.fallOfWickets[0]?.score).toBe(4);
    expect(s.fallOfWickets[0]?.playerOut).toBe(STRIKER);
  });
});

describe("free hit", () => {
  it("arms a free hit on the delivery after a no-ball", () => {
    const afterNoBall = reduceInnings(baseConfig(), R, sequence([
      { extraType: "no_ball", extraRuns: 1 },
    ]));
    expect(afterNoBall.isFreeHitNext).toBe(true);
  });

  it("does not arm a free hit after a wide", () => {
    const s = reduceInnings(baseConfig(), R, sequence([
      { extraType: "wide", extraRuns: 1 },
    ]));
    expect(s.isFreeHitNext).toBe(false);
  });

  it("on a free hit a run_out still stands and counts as a wicket", () => {
    const runOutFH = reduceInnings(baseConfig(), R, sequence([
      { extraType: "no_ball", extraRuns: 1 },
      { isFreeHit: true, batRuns: 1, wicket: wicket("run_out", NON_STRIKER, null, [pid(7)]) },
    ]));
    expect(runOutFH.wickets).toBe(1);
  });

  it("on a free hit a bowled/caught/lbw/stumped/hit_wicket is IGNORED (not a wicket)", () => {
    // Real cricket: on a free hit the striker cannot be dismissed by any mode
    // that would credit the bowler. The engine must defensively drop such a
    // wicket even if a caller mis-records it, so the batting side is not robbed.
    for (const type of ["bowled", "caught", "lbw", "stumped", "hit_wicket"] as const) {
      const s = reduceInnings(baseConfig(), R, sequence([
        { extraType: "no_ball", extraRuns: 1 },
        {
          isFreeHit: true,
          batRuns: 4,
          wicket: wicket(type, STRIKER, BOWLER, type === "caught" ? [pid(7)] : []),
        },
      ]));
      // No wicket at all: not in the team count, not on the bowler, batter not out.
      expect(s.wickets).toBe(0);
      const b = s.bowlingCards.find((x) => x.player === BOWLER);
      expect(b?.wickets).toBe(0);
      const bat = s.battingCards.find((x) => x.player === STRIKER);
      expect(bat?.isOut).toBe(false);
      // The four off the (ignored-dismissal) free hit still counts.
      expect(s.runs).toBe(5); // 1 no-ball penalty + 4 off the bat
      expect(s.fallOfWickets).toHaveLength(0);
    }
  });
});
