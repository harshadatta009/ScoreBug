import { describe, it, expect } from "vitest";
import {
  isLegalDelivery,
  batterFaced,
  runsOffBall,
  ranRunsForRotation,
  strikeRotates,
} from "../legality";
import { makeBall, rules } from "./fixtures";

const R = rules();

describe("legality", () => {
  it("wide and no-ball are not legal deliveries", () => {
    expect(isLegalDelivery(makeBall(1, { extraType: "wide", extraRuns: 1 }))).toBe(false);
    expect(isLegalDelivery(makeBall(2, { extraType: "no_ball", extraRuns: 1 }))).toBe(false);
  });

  it("byes, leg-byes and clean deliveries are legal", () => {
    expect(isLegalDelivery(makeBall(1, { extraType: "bye", extraRuns: 1 }))).toBe(true);
    expect(isLegalDelivery(makeBall(2, { extraType: "leg_bye", extraRuns: 2 }))).toBe(true);
    expect(isLegalDelivery(makeBall(3, { batRuns: 4 }))).toBe(true);
  });

  it("batter faces everything except a wide", () => {
    expect(batterFaced(makeBall(1, { extraType: "wide", extraRuns: 1 }))).toBe(false);
    expect(batterFaced(makeBall(2, { extraType: "no_ball", extraRuns: 1 }))).toBe(true);
    expect(batterFaced(makeBall(3, { extraType: "bye", extraRuns: 1 }))).toBe(true);
    expect(batterFaced(makeBall(4, { batRuns: 1 }))).toBe(true);
  });

  it("runsOffBall sums bat + extra", () => {
    expect(runsOffBall(makeBall(1, { batRuns: 4 }))).toBe(4);
    expect(runsOffBall(makeBall(2, { extraType: "wide", extraRuns: 3 }))).toBe(3);
    expect(runsOffBall(makeBall(3, { batRuns: 2, extraType: "no_ball", extraRuns: 1 }))).toBe(3);
  });

  it("ranRunsForRotation strips the wide/no-ball penalty", () => {
    // wide of 1 = pure penalty, nothing ran.
    expect(ranRunsForRotation(makeBall(1, { extraType: "wide", extraRuns: 1 }), R)).toBe(0);
    // wide of 3 = 1 penalty + 2 byes ran -> 2 ran.
    expect(ranRunsForRotation(makeBall(2, { extraType: "wide", extraRuns: 3 }), R)).toBe(2);
    // no-ball + 2 run off the bat -> penalty stripped from extraRuns(=1), bat 2 -> 2.
    expect(
      ranRunsForRotation(makeBall(3, { batRuns: 2, extraType: "no_ball", extraRuns: 1 }), R),
    ).toBe(2);
  });

  it("strike rotates on odd ran runs only", () => {
    expect(strikeRotates(makeBall(1, { batRuns: 1 }), R)).toBe(true);
    expect(strikeRotates(makeBall(2, { batRuns: 2 }), R)).toBe(false);
    expect(strikeRotates(makeBall(3, { batRuns: 4 }), R)).toBe(false);
    expect(strikeRotates(makeBall(4, { batRuns: 3 }), R)).toBe(true);
    // single bye rotates.
    expect(strikeRotates(makeBall(5, { extraType: "leg_bye", extraRuns: 1 }), R)).toBe(true);
    // wide of 1 (pure penalty) does not rotate.
    expect(strikeRotates(makeBall(6, { extraType: "wide", extraRuns: 1 }), R)).toBe(false);
  });
});
