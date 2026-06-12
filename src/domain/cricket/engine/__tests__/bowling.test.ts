import { describe, it, expect } from "vitest";
import { reduceInnings } from "../reducer";
import { oversText, oversDecimal } from "../bowling";
import { baseConfig, rules, sequence, BOWLER } from "./fixtures";

const R = rules();

describe("overs formatting", () => {
  it("formats legal balls as X.Y", () => {
    expect(oversText(0, 6)).toBe("0.0");
    expect(oversText(22, 6)).toBe("3.4");
    expect(oversText(6, 6)).toBe("1.0");
    expect(oversText(11, 6)).toBe("1.5");
  });

  it("decimal overs for NRR/economy", () => {
    expect(oversDecimal(6, 6)).toBe(1);
    expect(oversDecimal(3, 6)).toBeCloseTo(0.5, 5);
  });
});

describe("maiden detection", () => {
  it("counts a maiden when a full over of 6 legal dots concedes 0 runs", () => {
    const balls = sequence(Array.from({ length: 6 }, () => ({ batRuns: 0 as const })));
    const s = reduceInnings(baseConfig(), R, balls);
    const b = s.bowlingCards.find((x) => x.player === BOWLER);
    expect(b?.maidens).toBe(1);
    expect(b?.dots).toBe(6);
    expect(b?.economy).toBe(0);
  });

  it("is NOT a maiden if any run is conceded in the over", () => {
    const balls = sequence([
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 1 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    const b = s.bowlingCards.find((x) => x.player === BOWLER);
    expect(b?.maidens).toBe(0);
  });

  it("is NOT a maiden when an extra (wide) is conceded even if otherwise dot", () => {
    // 6 legal dots but an interleaved wide concedes a run -> not a maiden.
    const balls = sequence([
      { batRuns: 0 },
      { extraType: "wide", extraRuns: 1 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    const b = s.bowlingCards.find((x) => x.player === BOWLER);
    expect(b?.legalBalls).toBe(6);
    expect(b?.maidens).toBe(0);
  });

  it("does NOT charge byes/leg-byes run off a no-ball to the bowler", () => {
    // No-ball, batters run 2 byes off it: extraRuns = 1 penalty + 2 byes = 3,
    // batRuns 0. The bowler is charged ONLY the 1-run no-ball penalty; the 2
    // byes are the team's, not the bowler's. Team total still gets all 3.
    const balls = sequence([
      { extraType: "no_ball", extraRuns: 3 },
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    const b = s.bowlingCards.find((x) => x.player === BOWLER);
    expect(b?.runsConceded).toBe(1); // penalty only, byes excluded
    expect(s.runs).toBe(3); // team gets penalty + the 2 byes run
  });

  it("charges a no-ball hit for runs (off the bat) fully to the bowler", () => {
    // No-ball smashed for four: batRuns 4, extraRuns 1 (penalty) -> bowler 5.
    const balls = sequence([
      { extraType: "no_ball", batRuns: 4, extraRuns: 1 },
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    const b = s.bowlingCards.find((x) => x.player === BOWLER);
    expect(b?.runsConceded).toBe(5);
    expect(s.runs).toBe(5);
  });

  it("computes economy from runs conceded and overs", () => {
    // One over, 12 runs (two sixes + four dots) -> economy 12.
    const balls = sequence([
      { batRuns: 6 },
      { batRuns: 6 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
      { batRuns: 0 },
    ]);
    const s = reduceInnings(baseConfig(), R, balls);
    const b = s.bowlingCards.find((x) => x.player === BOWLER);
    expect(b?.runsConceded).toBe(12);
    expect(b?.economy).toBeCloseTo(12, 5);
  });
});
