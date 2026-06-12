"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BatRuns, ExtraType } from "@/domain/cricket/enums";

// ---------------------------------------------------------------------------
// Callback types
// ---------------------------------------------------------------------------

export interface OnScorePayload {
  batRuns: BatRuns;
}

export interface OnExtraPayload {
  extraType: ExtraType;
  /** Extra runs (defaults to 1 penalty for wide/no-ball, or user-entered for bye/leg-bye). */
  extraRuns: number;
  batRuns: BatRuns;
}

export interface OnWicketPayload {
  /** Runs scored on the same delivery as the wicket (often 0). */
  batRuns: BatRuns;
}

interface ScoringPadProps {
  /** Called when a legal scoring shot is recorded. */
  onScore: (payload: OnScorePayload) => void;
  /** Called when an extra delivery is recorded. */
  onExtra: (payload: OnExtraPayload) => void;
  /** Called when a wicket is triggered (opens wicket dialog in the page). */
  onWicket: (payload: OnWicketPayload) => void;
  /** Called when the last delivery is undone. */
  onUndo: () => void;
  /** Whether there is anything to undo (controls button enabled state). */
  canUndo?: boolean;
  /** Whether the next delivery is a free hit (UI hint). */
  isFreeHit?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Score-tick animation
// ---------------------------------------------------------------------------

interface ScoreTickProps {
  value: string;
  id: string;
}

function ScoreTick({ value, id }: ScoreTickProps) {
  return (
    <AnimatePresence>
      <motion.span
        key={id}
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl font-bold text-primary"
        initial={{ opacity: 1, y: 0, scale: 1 }}
        animate={{ opacity: 0, y: -40, scale: 1.4 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        aria-hidden="true"
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Individual score button
// ---------------------------------------------------------------------------

interface ScoreButtonProps {
  label: string;
  sublabel?: string;
  onPress: () => void;
  variant?: "default" | "four" | "six" | "wicket" | "extra" | "undo";
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

const variantClasses: Record<NonNullable<ScoreButtonProps["variant"]>, string> =
  {
    default:
      "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-95",
    four: "bg-four text-white hover:bg-four/80 active:scale-95",
    six: "bg-six text-white hover:bg-six/80 active:scale-95",
    wicket: "bg-wicket text-white hover:bg-wicket/80 active:scale-95",
    extra: "bg-extra text-black hover:bg-extra/80 active:scale-95",
    undo: "bg-muted text-muted-foreground hover:bg-muted/80 active:scale-95",
  };

function ScoreButton({
  label,
  sublabel,
  onPress,
  variant = "default",
  disabled,
  ariaLabel,
  className,
}: ScoreButtonProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.93 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      onClick={onPress}
      className={cn(
        // min-h-14 = 56px minimum touch target
        "relative flex min-h-14 flex-col items-center justify-center rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
        variantClasses[variant],
        className,
      )}
    >
      <span className="text-xl leading-none">{label}</span>
      {sublabel && (
        <span className="mt-0.5 text-[11px] font-normal opacity-70">
          {sublabel}
        </span>
      )}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// ScoringPad
// ---------------------------------------------------------------------------

/**
 * ScoringPad — the primary mobile scoring control.
 *
 * Presentational: it only calls the callbacks supplied by the parent; all
 * state derivation and persistence is the parent's responsibility. The scoring
 * PAGE wires this to useScoringStore.
 *
 * Touch targets are >= 56 px tall (min-h-14) as required for comfortable
 * one-handed operation on mobile.
 *
 * A framer-motion "score tick" animation flies the run value upward on each
 * legal run button press to give instant tactile feedback.
 */
export function ScoringPad({
  onScore,
  onExtra,
  onWicket,
  onUndo,
  canUndo = false,
  isFreeHit = false,
  className,
}: ScoringPadProps) {
  // Tracks the last tick so AnimatePresence can re-trigger for repeated values.
  const [lastTick, setLastTick] = React.useState<{
    value: string;
    id: string;
  } | null>(null);

  function handleRun(runs: BatRuns) {
    onScore({ batRuns: runs });
    setLastTick({ value: String(runs), id: `${runs}-${Date.now()}` });
  }

  function handleExtra(
    extraType: ExtraType,
    extraRuns: number,
    batRuns: BatRuns = 0,
  ) {
    onExtra({ extraType, extraRuns, batRuns });
  }

  return (
    <div
      className={cn(
        "relative select-none rounded-t-2xl border-t border-border bg-muted/30 px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3",
        className,
      )}
    >
      {/* Grabber + label */}
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tap to score
        </span>
        {isFreeHit && (
          <span className="rounded-full bg-six px-2.5 py-0.5 text-xs font-bold text-white">
            FREE HIT
          </span>
        )}
      </div>

      {/* Score-tick overlay — anchored over the grid, no reserved space */}
      <div className="pointer-events-none absolute left-1/2 top-10 z-10 h-0 -translate-x-1/2">
        {lastTick && <ScoreTick value={lastTick.value} id={lastTick.id} />}
      </div>

      {/* ── Run buttons (0–6) ──────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {([0, 1, 2, 3] as BatRuns[]).map((run) => (
          <ScoreButton
            key={run}
            label={String(run)}
            sublabel={run === 0 ? "Dot" : run === 1 ? "Single" : `${run} runs`}
            onPress={() => handleRun(run)}
            ariaLabel={`${run} run${run !== 1 ? "s" : ""}`}
            className="min-h-16"
          />
        ))}

        <ScoreButton
          label="4"
          sublabel="Boundary"
          onPress={() => handleRun(4)}
          variant="four"
          ariaLabel="Four — boundary"
          className="col-span-2 min-h-16"
        />
        <ScoreButton
          label="6"
          sublabel="Six"
          onPress={() => handleRun(6)}
          variant="six"
          ariaLabel="Six — maximum"
          className="col-span-2 min-h-16"
        />
      </div>

      {/* ── Extras row ────────────────────────────────────────────────── */}
      <div className="mt-2 grid grid-cols-4 gap-2">
        <ScoreButton label="Wd" sublabel="Wide" onPress={() => handleExtra("wide", 1)} variant="extra" ariaLabel="Wide ball" />
        <ScoreButton label="Nb" sublabel="No ball" onPress={() => handleExtra("no_ball", 1)} variant="extra" ariaLabel="No ball" />
        <ScoreButton label="Bye" sublabel="Bye" onPress={() => handleExtra("bye", 1)} ariaLabel="Bye — 1 run" />
        <ScoreButton label="Lb" sublabel="Leg bye" onPress={() => handleExtra("leg_bye", 1)} ariaLabel="Leg bye — 1 run" />
      </div>

      {/* ── Wicket + Undo ─────────────────────────────────────────────── */}
      <div className="mt-2 grid grid-cols-4 gap-2">
        <ScoreButton
          label="OUT"
          sublabel="Wicket"
          onPress={() => onWicket({ batRuns: 0 })}
          variant="wicket"
          ariaLabel="Record wicket"
          className="col-span-3"
        />
        <motion.button
          type="button"
          whileTap={{ scale: 0.93 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          disabled={!canUndo}
          aria-label="Undo last delivery"
          onClick={onUndo}
          className={cn(
            "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
            variantClasses["undo"],
          )}
        >
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
          <span className="text-[11px] font-normal opacity-70">Undo</span>
        </motion.button>
      </div>
    </div>
  );
}
