import { describe, expect, it } from "vitest";

import type { BallEvent, WicketEvent } from "@/domain/cricket/ball";
import type { BatRuns, DismissalType, ExtraType } from "@/domain/cricket/enums";
import { DEFAULT_T20_RULES } from "@/domain/cricket/match";
import { asId } from "@/domain/shared/ids";
import type { BallId, InningsId, PlayerId } from "@/domain/shared/ids";

import {
  aggregateBatting,
  aggregateBowling,
  aggregateFielding,
} from "../aggregate";

/**
 * Aggregation correctness. We fabricate a small, hand-checkable multi-over,
 * multi-innings BallEvent[] and assert the resulting career numbers. The point
 * is that batting/bowling/fielding figures match what a human scorer would
 * tally from the same deliveries.
 */

const pid = (n: number): PlayerId => asId<"PlayerId">(`player-${n}`);
const inn = (n: number): InningsId => asId<"InningsId">(`innings-${n}`);

interface Opts {
  innings?: InningsId;
  over?: number;
  striker?: PlayerId;
  nonStriker?: PlayerId;
  bowler?: PlayerId;
  batRuns?: BatRuns;
  extraType?: ExtraType | null;
  extraRuns?: number;
  wicket?: WicketEvent | null;
}

let seq = 0;
const ball = (o: Opts = {}): BallEvent => {
  seq += 1;
  return {
    id: asId<"BallId">(`ball-${seq}`) as BallId,
    inningsId: o.innings ?? inn(1),
    sequence: seq,
    over: o.over ?? 0,
    ballInOver: 1,
    striker: o.striker ?? pid(1),
    nonStriker: o.nonStriker ?? pid(2),
    bowler: o.bowler ?? pid(11),
    batRuns: o.batRuns ?? 0,
    extraType: o.extraType ?? null,
    extraRuns: o.extraRuns ?? 0,
    wicket: o.wicket ?? null,
    isFreeHit: false,
    commentary: null,
    recordedAt: "2026-06-12T00:00:00.000Z",
    recordedBy: null,
  };
};

const w = (
  type: DismissalType,
  playerOut: PlayerId,
  bowler: PlayerId | null,
  fielders: PlayerId[] = [],
): WicketEvent => ({ type, playerOut, bowler, fielders });

describe("aggregateBatting", () => {
  it("tallies runs, balls, boundaries, SR and average across innings", () => {
    seq = 0;
    const balls: BallEvent[] = [
      // Innings 1: player 1 scores 4,6,1 (11 off 3), then out caught next ball.
      ball({ striker: pid(1), batRuns: 4 }),
      ball({ striker: pid(1), batRuns: 6 }),
      ball({ striker: pid(1), batRuns: 1 }),
      ball({
        striker: pid(1),
        batRuns: 0,
        wicket: w("caught", pid(1), pid(11), [pid(7)]),
      }),
      // A wide faced by player 1 — must NOT count as a ball faced, no bat runs.
      ball({ striker: pid(1), extraType: "wide", extraRuns: 1 }),
      // Innings 2: player 1 scores 2,2 and remains not out.
      ball({ innings: inn(2), striker: pid(1), batRuns: 2 }),
      ball({ innings: inn(2), striker: pid(1), batRuns: 2 }),
    ];

    const bat = aggregateBatting(balls);
    const p1 = bat.get(pid(1));
    expect(p1).toBeDefined();
    expect(p1!.runs).toBe(15); // 11 + 0 + 4 (innings 2)
    expect(p1!.ballsFaced).toBe(6); // 4 in inns1 (wide excluded) + 2 in inns2
    expect(p1!.fours).toBe(1);
    expect(p1!.sixes).toBe(1);
    expect(p1!.inningsBatted).toBe(2);
    expect(p1!.highestScore).toBe(11);
    expect(p1!.notOuts).toBe(1); // out once across two innings
    // Average = runs / dismissals = 15 / 1.
    expect(p1!.average).toBe(15);
    // SR = 15/6*100 = 250.
    expect(p1!.strikeRate).toBeCloseTo(250, 5);
  });

  it("counts a run-out non-striker as a dismissal in that innings (no balls faced)", () => {
    seq = 0;
    const balls: BallEvent[] = [
      // Player 2 (non-striker) run out without facing a ball.
      ball({
        striker: pid(1),
        nonStriker: pid(2),
        batRuns: 1,
        wicket: w("run_out", pid(2), null, [pid(5)]),
      }),
    ];
    const bat = aggregateBatting(balls);
    const p2 = bat.get(pid(2))!;
    expect(p2.inningsBatted).toBe(1);
    expect(p2.ballsFaced).toBe(0);
    expect(p2.notOuts).toBe(0); // dismissed
    expect(p2.average).toBe(0); // 0 runs / 1 dismissal
  });

  it("flags fifties and hundreds per innings", () => {
    seq = 0;
    const balls: BallEvent[] = [];
    // 13 sixes = 78 -> a fifty in innings 1.
    for (let i = 0; i < 13; i++) balls.push(ball({ striker: pid(3), batRuns: 6 }));
    // 17 sixes = 102 -> a hundred in innings 2.
    for (let i = 0; i < 17; i++)
      balls.push(ball({ innings: inn(2), striker: pid(3), batRuns: 6 }));

    const p3 = aggregateBatting(balls).get(pid(3))!;
    expect(p3.fifties).toBe(1);
    expect(p3.hundreds).toBe(1);
    expect(p3.highestScore).toBe(102);
  });

  it("guards strike rate against zero balls faced", () => {
    seq = 0;
    // Only a wide: bowler bowled but no legal ball faced by striker.
    const balls = [ball({ striker: pid(9), extraType: "wide", extraRuns: 1 })];
    const p9 = aggregateBatting(balls).get(pid(9))!;
    expect(p9.ballsFaced).toBe(0);
    expect(p9.strikeRate).toBe(0);
    expect(p9.average).toBeNull();
  });

  it("returns null average when the batter was never dismissed (notOuts == innings)", () => {
    seq = 0;
    // Two innings, player 1 ends not out in both -> average is undefined ('-').
    const balls: BallEvent[] = [];
    for (let i = 0; i < 5; i++) balls.push(ball({ innings: inn(1), striker: pid(1), batRuns: 6 }));
    for (let i = 0; i < 5; i++) balls.push(ball({ innings: inn(2), striker: pid(1), batRuns: 6 }));
    const p1 = aggregateBatting(balls).get(pid(1))!;
    expect(p1.inningsBatted).toBe(2);
    expect(p1.notOuts).toBe(2);
    expect(p1.average).toBeNull(); // never NaN / Infinity
    expect(p1.runs).toBe(60);
  });

  it("classifies a score of exactly 50 as a fifty and exactly 100 as a hundred (not both)", () => {
    seq = 0;
    const balls: BallEvent[] = [];
    // Innings 1: exactly 50 (a fifty, not a hundred).
    for (let i = 0; i < 25; i++)
      balls.push(ball({ innings: inn(1), striker: pid(4), batRuns: 2 }));
    // Innings 2: exactly 100 (a hundred, not double-counted as a fifty).
    for (let i = 0; i < 25; i++)
      balls.push(ball({ innings: inn(2), striker: pid(4), batRuns: 4 }));
    const p4 = aggregateBatting(balls).get(pid(4))!;
    expect(p4.fifties).toBe(1); // the 50, not the 100
    expect(p4.hundreds).toBe(1); // the 100
    expect(p4.highestScore).toBe(100);
  });
});

describe("aggregateBowling", () => {
  it("charges runs correctly (byes excluded, wides/no-balls included) and counts wickets", () => {
    seq = 0;
    const rules = DEFAULT_T20_RULES;
    const balls: BallEvent[] = [
      ball({ bowler: pid(11), batRuns: 4 }), // 4 charged
      ball({ bowler: pid(11), extraType: "wide", extraRuns: 1 }), // 1 charged
      ball({ bowler: pid(11), extraType: "bye", extraRuns: 2 }), // 0 charged (bye)
      ball({
        bowler: pid(11),
        batRuns: 0,
        wicket: w("bowled", pid(1), pid(11)),
      }), // wicket, 0 runs
      // A no-ball: penalty (1) charged, plus bat runs 0.
      ball({ bowler: pid(11), extraType: "no_ball", extraRuns: 1 }),
    ];
    const bowl = aggregateBowling(balls, rules);
    const p11 = bowl.get(pid(11))!;
    expect(p11.runsConceded).toBe(6); // 4 + 1 (wide) + 0 (bye) + 0 + 1 (nb penalty)
    expect(p11.wickets).toBe(1);
    // Legal balls: 4,bye,bowled are legal = 3. wide + no-ball excluded.
    expect(p11.ballsBowled).toBe(3);
    expect(p11.bestBowling).toBe("1/6");
  });

  it("detects a maiden over and excludes overs with extras", () => {
    seq = 0;
    const rules = DEFAULT_T20_RULES; // 6 balls/over
    const balls: BallEvent[] = [];
    // Over 0: six legal dot balls -> maiden.
    for (let i = 0; i < 6; i++) balls.push(ball({ bowler: pid(12), over: 0 }));
    // Over 1: six legal but one had a wide injected -> NOT a maiden.
    for (let i = 0; i < 6; i++) balls.push(ball({ bowler: pid(12), over: 1 }));
    balls.push(ball({ bowler: pid(12), over: 1, extraType: "wide", extraRuns: 1 }));

    const p12 = aggregateBowling(balls, rules).get(pid(12))!;
    expect(p12.maidens).toBe(1);
    expect(p12.economy).toBeCloseTo(1 / 2, 5); // 1 run over 12 legal balls = 2 overs
  });

  it("guards economy/average/strikeRate against divide-by-zero", () => {
    seq = 0;
    // Only a wide -> 0 legal balls, 0 wickets.
    const balls = [ball({ bowler: pid(13), extraType: "wide", extraRuns: 1 })];
    const p13 = aggregateBowling(balls, DEFAULT_T20_RULES).get(pid(13))!;
    expect(p13.ballsBowled).toBe(0);
    expect(p13.economy).toBe(0);
    expect(p13.average).toBeNull();
    expect(p13.strikeRate).toBeNull();
  });

  it("computes bowling average (runs/wkts), strike rate (balls/wkts) and economy", () => {
    seq = 0;
    const rules = DEFAULT_T20_RULES; // 6 balls/over
    const balls: BallEvent[] = [];
    // 12 legal deliveries (2 overs): 24 runs off the bat, 2 wickets.
    for (let i = 0; i < 10; i++) balls.push(ball({ bowler: pid(15), batRuns: 2 }));
    balls.push(ball({ bowler: pid(15), batRuns: 4, wicket: w("bowled", pid(1), pid(15)) }));
    balls.push(ball({ bowler: pid(15), batRuns: 0, wicket: w("lbw", pid(2), pid(15)) }));
    const p15 = aggregateBowling(balls, rules).get(pid(15))!;
    expect(p15.ballsBowled).toBe(12);
    expect(p15.runsConceded).toBe(24); // 10*2 + 4 + 0
    expect(p15.wickets).toBe(2);
    expect(p15.average).toBeCloseTo(12, 5); // 24 / 2
    expect(p15.strikeRate).toBeCloseTo(6, 5); // 12 balls / 2 wkts
    expect(p15.economy).toBeCloseTo(12, 5); // 24 runs / 2 overs
  });

  it("counts an over of all byes as a maiden (byes are not charged to the bowler)", () => {
    seq = 0;
    const rules = DEFAULT_T20_RULES;
    const balls: BallEvent[] = [];
    // Six legal leg-byes: no runs charged to the bowler -> a maiden, matching
    // the live-scorecard engine which folds the same bowlerRunsConceded.
    for (let i = 0; i < 6; i++)
      balls.push(ball({ bowler: pid(16), over: 0, extraType: "leg_bye", extraRuns: 1 }));
    const p16 = aggregateBowling(balls, rules).get(pid(16))!;
    expect(p16.ballsBowled).toBe(6);
    expect(p16.runsConceded).toBe(0); // leg-byes are the team's, not the bowler's
    expect(p16.maidens).toBe(1);
  });

  it("does not count an incomplete over as a maiden", () => {
    seq = 0;
    const rules = DEFAULT_T20_RULES;
    // Only 5 legal dot balls in the over -> over not completed -> no maiden.
    const balls: BallEvent[] = [];
    for (let i = 0; i < 5; i++) balls.push(ball({ bowler: pid(17), over: 0 }));
    const p17 = aggregateBowling(balls, rules).get(pid(17))!;
    expect(p17.maidens).toBe(0);
  });

  it("picks best bowling by most wickets then fewest runs across innings", () => {
    seq = 0;
    const balls: BallEvent[] = [
      // Innings 1: 2 wickets for 10.
      ball({ innings: inn(1), bowler: pid(14), batRuns: 6 }),
      ball({ innings: inn(1), bowler: pid(14), batRuns: 4 }),
      ball({ innings: inn(1), bowler: pid(14), wicket: w("bowled", pid(1), pid(14)) }),
      ball({ innings: inn(1), bowler: pid(14), wicket: w("lbw", pid(2), pid(14)) }),
      // Innings 2: 2 wickets for 3 -> better (same wickets, fewer runs).
      ball({ innings: inn(2), bowler: pid(14), batRuns: 3 }),
      ball({ innings: inn(2), bowler: pid(14), wicket: w("bowled", pid(3), pid(14)) }),
      ball({ innings: inn(2), bowler: pid(14), wicket: w("caught", pid(4), pid(14), [pid(7)]) }),
    ];
    const p14 = aggregateBowling(balls, DEFAULT_T20_RULES).get(pid(14))!;
    expect(p14.wickets).toBe(4);
    expect(p14.bestBowling).toBe("2/3");
    expect(p14.inningsBowled).toBe(2);
  });
});

describe("aggregateFielding", () => {
  it("credits catches, stumpings and run-outs to the right fielders", () => {
    seq = 0;
    const balls: BallEvent[] = [
      ball({ wicket: w("caught", pid(1), pid(11), [pid(7)]) }), // catch -> 7
      ball({ wicket: w("caught", pid(2), pid(11), [pid(7)]) }), // catch -> 7
      ball({ wicket: w("stumped", pid(3), pid(11), [pid(8)]) }), // stumping -> 8
      ball({ wicket: w("run_out", pid(4), null, [pid(5), pid(8)]) }), // run-out -> 5 & 8
      ball({ wicket: w("bowled", pid(5), pid(11)) }), // no fielder credit
    ];
    const field = aggregateFielding(balls);
    expect(field.get(pid(7))!.catches).toBe(2);
    expect(field.get(pid(8))!.stumpings).toBe(1);
    expect(field.get(pid(8))!.runOuts).toBe(1);
    expect(field.get(pid(8))!.dismissals).toBe(2);
    expect(field.get(pid(5))!.runOuts).toBe(1);
    expect(field.has(pid(11))).toBe(false); // bowled credits nobody fielding
  });

  it("ignores caught/stumped with an empty fielder list rather than crashing", () => {
    seq = 0;
    const balls = [ball({ wicket: w("caught", pid(1), pid(11), []) })];
    const field = aggregateFielding(balls);
    expect(field.size).toBe(0);
  });
});
