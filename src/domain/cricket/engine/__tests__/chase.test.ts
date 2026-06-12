import { describe, it, expect } from "vitest";
import { reduceInnings } from "../reducer";
import { computeChase, isChaseComplete, totalChaseBalls } from "../chase";
import { baseConfig, rules, sequence } from "./fixtures";
import type { ChaseTarget } from "../../match";

const R = rules();

describe("chase maths (unit)", () => {
  const target: ChaseTarget = { runs: 100 };

  it("computes total balls from overs", () => {
    expect(totalChaseBalls(target, R)).toBe(120); // 20 * 6
  });

  it("honours revised overs", () => {
    expect(totalChaseBalls({ runs: 100, revisedOvers: 10 }, R)).toBe(60);
  });

  it("runsRequired / ballsRemaining / RRR", () => {
    // scored 40 off 60 balls (10 overs), need 60 off 60 -> RRR 6.0
    const c = computeChase(target, R, 40, 60);
    expect(c.runsRequired).toBe(60);
    expect(c.ballsRemaining).toBe(60);
    expect(c.requiredRunRate).toBeCloseTo(6, 5);
  });

  it("floors runsRequired at zero once chased", () => {
    const c = computeChase(target, R, 105, 90);
    expect(c.runsRequired).toBe(0);
  });

  it("RRR is zero when no balls remain", () => {
    const c = computeChase(target, R, 90, 120);
    expect(c.ballsRemaining).toBe(0);
    expect(c.requiredRunRate).toBe(0);
  });

  it("isChaseComplete when runs reach target", () => {
    expect(isChaseComplete(target, 99)).toBe(false);
    expect(isChaseComplete(target, 100)).toBe(true);
    expect(isChaseComplete(target, 101)).toBe(true);
  });
});

describe("chase wiring in reduceInnings", () => {
  it("surfaces target fields and ends innings when target reached", () => {
    const config = baseConfig({ target: { runs: 5 } });
    // Score a four then a two -> 6 >= 5 -> innings complete on the two.
    const balls = sequence([{ batRuns: 4 }, { batRuns: 2 }]);
    const s = reduceInnings(config, R, balls);
    expect(s.target).toBe(5);
    expect(s.runs).toBe(6);
    expect(s.runsRequired).toBe(0);
    expect(s.isComplete).toBe(true);
  });

  it("leaves chase open and reports runs required when short", () => {
    const config = baseConfig({ target: { runs: 50 } });
    const balls = sequence([{ batRuns: 4 }, { batRuns: 4 }]);
    const s = reduceInnings(config, R, balls);
    expect(s.runs).toBe(8);
    expect(s.runsRequired).toBe(42);
    expect(s.ballsRemaining).toBe(118);
    expect(s.isComplete).toBe(false);
  });
});
