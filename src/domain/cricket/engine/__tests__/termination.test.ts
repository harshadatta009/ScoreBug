import { describe, it, expect } from "vitest";
import { reduceInnings, applyBall, initialState, projectScore } from "../reducer";
import {
  baseConfig,
  rules,
  sequence,
  makeBall,
  wicket,
  pid,
  BOWLER,
} from "./fixtures";

describe("innings termination", () => {
  it("ends all-out at playersPerSide - 1 wickets", () => {
    // 2 players per side -> all out after 1 wicket.
    const R = rules({ playersPerSide: 2 });
    const balls = sequence([{ wicket: wicket("bowled", pid(1), BOWLER) }]);
    const s = reduceInnings(baseConfig(), R, balls);
    expect(s.wickets).toBe(1);
    expect(s.isComplete).toBe(true);
  });

  it("ends when overs are exhausted", () => {
    // 1 over per innings, 6 legal balls -> complete.
    const R = rules({ oversPerInnings: 1 });
    const balls = sequence(Array.from({ length: 6 }, () => ({ batRuns: 1 as const })));
    const s = reduceInnings(baseConfig(), R, balls);
    expect(s.legalBalls).toBe(6);
    expect(s.isComplete).toBe(true);
  });

  it("ignores deliveries recorded after the innings is complete", () => {
    const R = rules({ oversPerInnings: 1 });
    const balls = sequence([
      ...Array.from({ length: 6 }, () => ({ batRuns: 1 as const })),
      { batRuns: 6 }, // should be ignored
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    expect(s.runs).toBe(6); // the trailing six is dropped
  });

  it("Test-style unlimited overs never terminates on overs", () => {
    const R = rules({ oversPerInnings: null, playersPerSide: 11 });
    const balls = sequence(Array.from({ length: 60 }, () => ({ batRuns: 1 as const })));
    const s = reduceInnings(baseConfig(), R, balls);
    expect(s.isComplete).toBe(false);
    expect(s.legalBalls).toBe(60);
  });
});

describe("incremental applyBall parity", () => {
  it("incremental folding equals a full reduce", () => {
    const R = rules();
    const balls = sequence([
      { batRuns: 1 },
      { extraType: "wide", extraRuns: 1 },
      { batRuns: 4 },
      { batRuns: 0, wicket: wicket("caught", pid(1), BOWLER, [pid(7)]) },
      { batRuns: 2 },
    ]);
    const full = reduceInnings(baseConfig(), R, balls);

    let st = initialState(baseConfig(), R);
    for (const b of balls) st = applyBall(st, b, R);
    const incremental = projectScore(st);

    expect(incremental.runs).toBe(full.runs);
    expect(incremental.wickets).toBe(full.wickets);
    expect(incremental.legalBalls).toBe(full.legalBalls);
    expect(incremental.extras.total).toBe(full.extras.total);
  });

  it("reduceInnings sorts by sequence (out-of-order input is deterministic)", () => {
    const R = rules();
    const ordered = [
      makeBall(1, { batRuns: 1 }),
      makeBall(2, { batRuns: 4 }),
      makeBall(3, { batRuns: 6 }),
    ];
    const shuffled = [ordered[2]!, ordered[0]!, ordered[1]!];
    const a = reduceInnings(baseConfig(), R, ordered);
    const b = reduceInnings(baseConfig(), R, shuffled);
    expect(b.runs).toBe(a.runs);
    expect(b.oversText).toBe(a.oversText);
  });
});

describe("super over", () => {
  it("models a 1-over chase that ends on target", () => {
    const R = rules({ oversPerInnings: 1, maxOversPerBowler: 1 });
    const config = baseConfig({
      isSuperOver: true,
      inningsNumber: 2,
      target: { runs: 10 },
    });
    const balls = sequence([
      { batRuns: 6 },
      { batRuns: 4 }, // 10 -> target reached
      { batRuns: 6 }, // ignored, innings already complete
    ]);
    const s = reduceInnings(config, R, balls);
    expect(s.runs).toBe(10);
    expect(s.isComplete).toBe(true);
    expect(s.runsRequired).toBe(0);
  });

  it("super over ends on overs exhausted if target not reached", () => {
    const R = rules({ oversPerInnings: 1 });
    const config = baseConfig({ isSuperOver: true, target: { runs: 20 } });
    const balls = sequence(Array.from({ length: 6 }, () => ({ batRuns: 1 as const })));
    const s = reduceInnings(config, R, balls);
    expect(s.runs).toBe(6);
    expect(s.isComplete).toBe(true);
    expect(s.runsRequired).toBe(14);
  });
});
