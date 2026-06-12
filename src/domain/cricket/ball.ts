import type { BallId, InningsId, PlayerId } from "../shared/ids";
import type { BatRuns, DismissalType, ExtraType } from "./enums";

/**
 * A wicket that fell on a delivery.
 *
 * `playerOut` is explicit because on a run-out it is not necessarily the
 * striker. `fielders` supports caught/run-out/stumped attribution (and combined
 * dismissals such as caught-and-bowled or run-out involving two fielders).
 */
export interface WicketEvent {
  type: DismissalType;
  /** The batter who is dismissed. */
  playerOut: PlayerId;
  /** Bowler credited (null for run_out / obstructing / retired etc.). */
  bowler: PlayerId | null;
  /** Fielders involved, in order of involvement (catcher, thrower→keeper, …). */
  fielders: PlayerId[];
}

/**
 * BallEvent — the atomic, immutable record of a single delivery.
 *
 * Every delivery is persisted as one row in `public.balls`. The entire match
 * scorecard and all derived statistics are a pure function of the ordered
 * sequence of these events, which makes scoring fully replayable, auditable,
 * and offline-syncable.
 */
export interface BallEvent {
  id: BallId;
  inningsId: InningsId;

  /**
   * Monotonic sequence number within the innings (1-based), assigned in the
   * order deliveries were bowled. This — not over/ball — is the canonical
   * ordering key, so it survives re-ordering edits and conflict resolution.
   */
  sequence: number;

  /** Over number (0-based) at the time of the delivery. */
  over: number;
  /**
   * Legal-ball ordinal within the over (1-based) for display. Illegal
   * deliveries (wide/no-ball) reuse the pending ball number.
   */
  ballInOver: number;

  striker: PlayerId;
  nonStriker: PlayerId;
  bowler: PlayerId;

  /** Runs scored off the bat (0 on a bye/leg-bye/wide). */
  batRuns: BatRuns;

  /**
   * Extra delivery type, or null for a legal ball with no extras.
   * The penalty/extra runs are encoded in `extraRuns`.
   */
  extraType: ExtraType | null;

  /**
   * Runs attributed to the extra:
   * - wide/no_ball: 1 penalty + any additional runs run (byes off a no-ball, etc.)
   * - bye/leg_bye: the number of bye/leg-bye runs run
   * For a legal scoring shot this is 0.
   */
  extraRuns: number;

  /** Wicket on this delivery, if any. */
  wicket: WicketEvent | null;

  /** True when the delivery was bowled under free-hit conditions. */
  isFreeHit: boolean;

  /** Optional human commentary for the timeline / feed. */
  commentary?: string | null;

  /** Wall-clock timestamp the delivery was recorded (ISO 8601, UTC). */
  recordedAt: string;
  /** Id of the user (scorer) who recorded it — for audit. */
  recordedBy: PlayerId | null;
}

/**
 * Input shape used by the scoring engine / UI to record a delivery, before an
 * id, sequence and positional numbers are assigned by the engine.
 */
export type RecordBallInput = Omit<
  BallEvent,
  "id" | "sequence" | "over" | "ballInOver" | "recordedAt"
> & {
  recordedAt?: string;
};
