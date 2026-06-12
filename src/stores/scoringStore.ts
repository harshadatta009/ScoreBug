import { create } from "zustand";

import type { BallEvent, RecordBallInput } from "@/domain/cricket/ball";
// The engine module is authored in parallel; we depend only on its public
// barrel. `reduceInnings(config, rules, balls)` folds the ordered ball log into
// a fully derived InningsScore — the single source of truth for the scorecard.
import { reduceInnings } from "@/domain/cricket/engine";
import type { InningsConfig, MatchRules } from "@/domain/cricket/match";
import type { InningsScore } from "@/domain/cricket/scorecard";
import { asId } from "@/domain/shared/ids";

/**
 * Scoring store — client-side state for the live scoring screen.
 *
 * The store holds the *inputs* (config, rules, ordered balls) and derives the
 * `InningsScore` purely via the engine. `recordBall` applies an optimistic ball
 * locally for instant UI feedback; the server action persists the canonical
 * row and `reconcile` replaces the local log with the authoritative one
 * (from the server action result or the realtime channel), discarding any
 * optimistic entries. This keeps the derived score correct even under
 * out-of-order or conflicting writes.
 */

interface ScoringState {
  config: InningsConfig | null;
  rules: MatchRules | null;
  balls: BallEvent[];
  /** Derived; recomputed on every mutation so consumers can read it directly. */
  score: InningsScore | null;
  /** Sequence numbers of balls applied optimistically and not yet confirmed. */
  pendingSequences: Set<number>;

  /** Initialize/reset the store for an innings. */
  init: (config: InningsConfig, rules: MatchRules, balls?: BallEvent[]) => void;
  /** Apply a delivery optimistically and return the materialized event. */
  recordBall: (input: RecordBallInput) => BallEvent;
  /** Replace the ball log with the authoritative server/realtime sequence. */
  reconcile: (balls: BallEvent[]) => void;
  /** Drop a single optimistic ball (e.g. the server insert failed). */
  rollback: (sequence: number) => void;
  reset: () => void;
}

/** Recompute the derived score, tolerating an as-yet-unconfigured store. */
function derive(
  config: InningsConfig | null,
  rules: MatchRules | null,
  balls: BallEvent[],
): InningsScore | null {
  if (!config || !rules) return null;
  return reduceInnings(config, rules, balls);
}

export const useScoringStore = create<ScoringState>((set, get) => ({
  config: null,
  rules: null,
  balls: [],
  score: null,
  pendingSequences: new Set<number>(),

  init: (config, rules, balls = []) => {
    set({
      config,
      rules,
      balls,
      score: derive(config, rules, balls),
      pendingSequences: new Set<number>(),
    });
  },

  recordBall: (input) => {
    const { config, rules, balls } = get();
    const last = balls.at(-1);
    const sequence = (last?.sequence ?? 0) + 1;

    // Positional fields are provisional client-side guesses; the server is
    // authoritative and `reconcile` will correct over/ballInOver if needed.
    const optimistic: BallEvent = {
      ...input,
      id: asId<"BallId">(
        // Stable temporary id so React keys are unique until reconciliation.
        `optimistic-${sequence}-${Date.now()}`,
      ),
      sequence,
      over: last ? last.over : 0,
      ballInOver: (last?.ballInOver ?? 0) + 1,
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    };

    const nextBalls = [...balls, optimistic];
    const pending = new Set(get().pendingSequences);
    pending.add(sequence);

    set({
      balls: nextBalls,
      score: derive(config, rules, nextBalls),
      pendingSequences: pending,
    });
    return optimistic;
  },

  reconcile: (serverBalls) => {
    const { config, rules } = get();
    const ordered = [...serverBalls].sort((a, b) => a.sequence - b.sequence);
    set({
      balls: ordered,
      score: derive(config, rules, ordered),
      // Anything still pending is now superseded by the authoritative log.
      pendingSequences: new Set<number>(),
    });
  },

  rollback: (sequence) => {
    const { config, rules, balls } = get();
    const nextBalls = balls.filter((b) => b.sequence !== sequence);
    const pending = new Set(get().pendingSequences);
    pending.delete(sequence);
    set({
      balls: nextBalls,
      score: derive(config, rules, nextBalls),
      pendingSequences: pending,
    });
  },

  reset: () =>
    set({
      config: null,
      rules: null,
      balls: [],
      score: null,
      pendingSequences: new Set<number>(),
    }),
}));
