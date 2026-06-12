"use client";

import { cn } from "@/lib/utils";
import type { BallEvent } from "@/domain/cricket/ball";

interface OverTimelineProps {
  /** All balls in the current innings (ordered by sequence). */
  balls: BallEvent[];
  className?: string;
}

/**
 * Describes a single delivery for display in the over timeline.
 */
interface BallDot {
  label: string;
  /** Tailwind color variant for the dot background. */
  variant: "default" | "four" | "six" | "wicket" | "extra" | "dot";
}

function classifyBall(ball: BallEvent): BallDot {
  if (ball.wicket && ball.wicket.type !== "retired_hurt") {
    return { label: "W", variant: "wicket" };
  }
  if (ball.extraType === "wide") {
    return { label: "Wd", variant: "extra" };
  }
  if (ball.extraType === "no_ball") {
    return { label: "Nb", variant: "extra" };
  }
  if (ball.batRuns === 6) {
    return { label: "6", variant: "six" };
  }
  if (ball.batRuns === 4) {
    return { label: "4", variant: "four" };
  }
  const total = ball.batRuns + ball.extraRuns;
  if (total === 0) {
    return { label: "•", variant: "dot" };
  }
  return { label: String(total), variant: "default" };
}

const variantClasses: Record<BallDot["variant"], string> = {
  default: "bg-secondary text-secondary-foreground",
  four: "bg-four text-white",
  six: "bg-six text-white",
  wicket: "bg-wicket text-white",
  extra: "bg-extra text-black",
  dot: "bg-muted text-muted-foreground",
};

/**
 * OverTimeline — horizontal scrollable list of over summaries.
 *
 * Groups balls into overs and renders each delivery as a colour-coded dot
 * (boundary green, six purple, wicket red, extra amber, dot grey). Only the
 * last N overs are shown on mobile to keep the strip compact.
 */
export function OverTimeline({ balls, className }: OverTimelineProps) {
  // Group by over number. Track legal-ball count to derive over number.
  type OverEntry = { overNum: number; dots: BallDot[] };
  const overs: OverEntry[] = [];
  let currentOver = -1;

  for (const ball of balls) {
    if (ball.over !== currentOver) {
      currentOver = ball.over;
      overs.push({ overNum: ball.over, dots: [] });
    }
    // noUncheckedIndexedAccess: last element guaranteed because we just pushed
    overs[overs.length - 1]!.dots.push(classifyBall(ball));
  }

  if (overs.length === 0) {
    return (
      <div
        className={cn(
          "flex h-12 items-center justify-center px-4 text-xs text-muted-foreground",
          className,
        )}
      >
        Over timeline will appear here
      </div>
    );
  }

  return (
    <div
      className={cn("overflow-x-auto", className)}
      aria-label="Over timeline"
    >
      <div className="flex min-w-max items-start gap-3 px-4 py-2">
        {overs.map(({ overNum, dots }) => (
          <div key={overNum} className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground">
              Ov {overNum + 1}
            </span>
            <div className="flex gap-1">
              {dots.map((dot, idx) => (
                <span
                  key={idx}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold",
                    variantClasses[dot.variant],
                  )}
                  aria-label={dot.label}
                >
                  {dot.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
