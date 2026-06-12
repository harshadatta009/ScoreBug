import "server-only";

import type {
  BallEvent,
  RecordBallInput,
  WicketEvent,
} from "@/domain/cricket/ball";
import type { DismissalType, ExtraType } from "@/domain/cricket/enums";
import { DISMISSAL_TYPES } from "@/domain/cricket/enums";
import { asId, type BallId, type InningsId } from "@/domain/shared/ids";
import type { BallRow } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Ball repository — the boundary between the `public.balls` table (snake_case,
 * denormalized wicket columns) and the immutable `BallEvent` domain type
 * (camelCase, nested `WicketEvent`). All id branding happens here via `asId`,
 * so domain code never touches a raw string id.
 */

const DISMISSAL_SET = new Set<string>(DISMISSAL_TYPES);

function toDismissalType(raw: string): DismissalType {
  if (!DISMISSAL_SET.has(raw)) {
    // The DB enum and the domain union are kept in lockstep by the migration;
    // an unknown value means schema/domain drift, which must fail loudly.
    throw new Error(`Unknown dismissal_type from DB: ${raw}`);
  }
  return raw as DismissalType;
}

/** Map a `public.balls` row to the domain `BallEvent`. */
export function rowToBallEvent(row: BallRow): BallEvent {
  const wicket: WicketEvent | null = row.wicket_type
    ? {
        type: toDismissalType(row.wicket_type),
        playerOut: asId<"PlayerId">(row.player_out_id ?? row.striker_id),
        bowler: row.wicket_bowler_id
          ? asId<"PlayerId">(row.wicket_bowler_id)
          : null,
        fielders: row.fielder_ids.map((f) => asId<"PlayerId">(f)),
      }
    : null;

  return {
    id: asId<"BallId">(row.id),
    inningsId: asId<"InningsId">(row.innings_id),
    sequence: row.sequence,
    over: row.over_number,
    ballInOver: row.ball_in_over,
    striker: asId<"PlayerId">(row.striker_id),
    nonStriker: asId<"PlayerId">(row.non_striker_id),
    bowler: asId<"PlayerId">(row.bowler_id),
    // bat_runs is constrained 0..7 in DB; the domain BatRuns is 0..6, but we
    // trust the engine to only ever write valid values, so a cast is safe.
    batRuns: row.bat_runs as BallEvent["batRuns"],
    extraType: row.extra_type as ExtraType | null,
    extraRuns: row.extra_runs,
    wicket,
    isFreeHit: row.is_free_hit,
    commentary: row.commentary,
    recordedAt: row.recorded_at,
    recordedBy: row.recorded_by ? asId<"PlayerId">(row.recorded_by) : null,
  };
}

/**
 * Map a domain `BallEvent` to an insertable `public.balls` row. The engine
 * assigns id/sequence/over/ballInOver before persistence, so a full BallEvent
 * is expected here.
 */
export function ballEventToInsert(event: BallEvent): BallRow {
  return {
    id: event.id,
    innings_id: event.inningsId,
    sequence: event.sequence,
    over_number: event.over,
    ball_in_over: event.ballInOver,
    striker_id: event.striker,
    non_striker_id: event.nonStriker,
    bowler_id: event.bowler,
    bat_runs: event.batRuns,
    extra_type: event.extraType,
    extra_runs: event.extraRuns,
    wicket_type: event.wicket?.type ?? null,
    player_out_id: event.wicket?.playerOut ?? null,
    wicket_bowler_id: event.wicket?.bowler ?? null,
    fielder_ids: event.wicket?.fielders ?? [],
    is_free_hit: event.isFreeHit,
    commentary: event.commentary ?? null,
    recorded_at: event.recordedAt,
    recorded_by: event.recordedBy,
  };
}

/**
 * Build a full `BallEvent` from a `RecordBallInput` plus the positional fields
 * the caller has resolved (id/sequence/over/ballInOver). Centralizes the
 * "fill in engine-assigned fields" step so server actions stay thin.
 */
export function materializeBall(
  input: RecordBallInput,
  positional: {
    id: BallId;
    sequence: number;
    over: number;
    ballInOver: number;
  },
): BallEvent {
  return {
    ...input,
    id: positional.id,
    sequence: positional.sequence,
    over: positional.over,
    ballInOver: positional.ballInOver,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
}

/** Fetch every delivery of an innings, ordered by canonical sequence. */
export async function getBallsForInnings(
  inningsId: InningsId,
): Promise<BallEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("balls")
    .select("*")
    .eq("innings_id", inningsId)
    .order("sequence", { ascending: true });

  if (error) throw new Error(`getBallsForInnings failed: ${error.message}`);
  return (data ?? []).map(rowToBallEvent);
}

/** Highest existing sequence number in an innings, or 0 if none yet. */
export async function getLastSequence(inningsId: InningsId): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("balls")
    .select("sequence")
    .eq("innings_id", inningsId)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getLastSequence failed: ${error.message}`);
  return data?.sequence ?? 0;
}

/** Insert a delivery and return the persisted, re-mapped domain event. */
export async function insertBall(event: BallEvent): Promise<BallEvent> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("balls")
    .insert(ballEventToInsert(event))
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`insertBall failed: ${error?.message ?? "no row returned"}`);
  }
  return rowToBallEvent(data);
}
