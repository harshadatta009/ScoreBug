import { describe, it, expect } from "vitest";
import { isOverInPowerplay, triggersFreeHit } from "../powerplay";
import { reduceInnings } from "../reducer";
import { baseConfig, rules, makeBall, sequence } from "./fixtures";

const R = rules();

describe("powerplay", () => {
  it("over membership is end-exclusive", () => {
    // DEFAULT_T20_RULES powerplay is {from:0,to:6} -> overs 0..5.
    expect(isOverInPowerplay(0, R)).toBe(true);
    expect(isOverInPowerplay(5, R)).toBe(true);
    expect(isOverInPowerplay(6, R)).toBe(false);
    expect(isOverInPowerplay(15, R)).toBe(false);
  });

  it("inPowerplay reflects the current over of the last delivery", () => {
    const inPP = reduceInnings(baseConfig(), R, [makeBall(1, { batRuns: 1, over: 2 })]);
    expect(inPP.inPowerplay).toBe(true);

    const outPP = reduceInnings(baseConfig(), R, [makeBall(1, { batRuns: 1, over: 10 })]);
    expect(outPP.inPowerplay).toBe(false);
  });

  it("triggersFreeHit only for no-balls when enabled", () => {
    expect(triggersFreeHit(makeBall(1, { extraType: "no_ball", extraRuns: 1 }), R)).toBe(true);
    expect(triggersFreeHit(makeBall(2, { extraType: "wide", extraRuns: 1 }), R)).toBe(false);
    expect(triggersFreeHit(makeBall(3, { batRuns: 4 }), R)).toBe(false);
  });

  it("does not trigger free hit when rule disabled", () => {
    const noFH = rules({ freeHitOnNoBall: false });
    const s = reduceInnings(baseConfig(), noFH, sequence([
      { extraType: "no_ball", extraRuns: 1 },
    ]));
    expect(s.isFreeHitNext).toBe(false);
  });
});
