import { describe, it, expect } from "vitest";
import { reduceInnings } from "../reducer";
import {
  baseConfig,
  rules,
  makeBall,
  sequence,
  STRIKER,
  NON_STRIKER,
  BOWLER,
} from "./fixtures";

const R = rules();

describe("reduceInnings — worked over", () => {
  it("scores a mixed over correctly (runs, extras, legal balls)", () => {
    // 1: dot, 2: four, 3: wide+1, 4: single, 5: no-ball (bat 0), 6: leg-bye 2,
    // 7: dot, 8: six  -> 6 legal balls = over complete.
    const balls = sequence([
      { batRuns: 0 },
      { batRuns: 4 },
      { extraType: "wide", extraRuns: 1 },
      { batRuns: 1 },
      { extraType: "no_ball", extraRuns: 1 },
      { extraType: "leg_bye", extraRuns: 2 },
      { batRuns: 0 },
      { batRuns: 6 },
    ]);
    const s = reduceInnings(baseConfig(), R, balls);

    // Runs: 0+4+1(wide)+1+1(nb)+2(lb)+0+6 = 15
    expect(s.runs).toBe(15);
    // Legal balls: total 8 deliveries minus 1 wide minus 1 no-ball = 6.
    expect(s.legalBalls).toBe(6);
    expect(s.oversText).toBe("1.0");
    expect(s.wickets).toBe(0);

    // Extras: wide 1, no-ball 1, leg-bye 2, total 4.
    expect(s.extras.wides).toBe(1);
    expect(s.extras.noBalls).toBe(1);
    expect(s.extras.legByes).toBe(2);
    expect(s.extras.byes).toBe(0);
    expect(s.extras.total).toBe(4);
  });

  it("bowler runs conceded excludes byes/leg-byes but includes wides/no-balls", () => {
    const balls = sequence([
      { batRuns: 4 }, // 4 to bowler
      { extraType: "wide", extraRuns: 2 }, // 2 to bowler
      { extraType: "no_ball", extraRuns: 1 }, // 1 to bowler
      { extraType: "bye", extraRuns: 4 }, // 0 to bowler
      { extraType: "leg_bye", extraRuns: 1 }, // 0 to bowler
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    const bowler = s.bowlingCards.find((b) => b.player === BOWLER);
    expect(bowler?.runsConceded).toBe(7); // 4 + 2 + 1
    expect(bowler?.wides).toBe(2);
    expect(bowler?.noBalls).toBe(1);
  });
});

describe("strike rotation", () => {
  it("rotates on a single and keeps strike on a two", () => {
    // After a single, striker should be NON_STRIKER (swapped).
    const s1 = reduceInnings(baseConfig(), R, [makeBall(1, { batRuns: 1 })]);
    expect(s1.strikerId).toBe(NON_STRIKER);
    expect(s1.nonStrikerId).toBe(STRIKER);

    const s2 = reduceInnings(baseConfig(), R, [makeBall(1, { batRuns: 2 })]);
    expect(s2.strikerId).toBe(STRIKER);
  });

  it("swaps ends at the end of a completed over", () => {
    // Six dot balls: no mid-over rotation, but end-of-over swaps once.
    const balls = sequence([
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    expect(s.legalBalls).toBe(6);
    expect(s.strikerId).toBe(NON_STRIKER); // swapped at over end
  });

  it("single off the last ball of an over keeps original striker (double swap)", () => {
    const balls = sequence([
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 1 }, // odd -> swap, then over-end -> swap back
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    expect(s.strikerId).toBe(STRIKER);
  });

  it("wides/no-balls do not advance the over count", () => {
    // 5 dots + 3 wides + 1 dot = 6 legal balls -> exactly one over.
    const balls = sequence([
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
      { extraType: "wide", extraRuns: 1 },
      { extraType: "wide", extraRuns: 1 },
      { extraType: "wide", extraRuns: 1 },
      { batRuns: 0 },
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    expect(s.legalBalls).toBe(6);
    expect(s.oversText).toBe("1.0");
  });
});

describe("batting cards", () => {
  it("attributes only bat runs, counts boundaries and balls faced", () => {
    const balls = sequence([
      { batRuns: 4 },
      { batRuns: 6 },
      { extraType: "wide", extraRuns: 1 }, // not faced
      { extraType: "bye", extraRuns: 2 }, // faced, 0 runs
      { batRuns: 1 },
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    const striker = s.battingCards.find((b) => b.player === STRIKER);
    expect(striker?.runs).toBe(11); // 4 + 6 + 1
    expect(striker?.fours).toBe(1);
    expect(striker?.sixes).toBe(1);
    // faced: four, six, bye, single = 4 (wide excluded).
    expect(striker?.ballsFaced).toBe(4);
    expect(striker?.strikeRate).toBeCloseTo((11 / 4) * 100, 5);
  });
});
