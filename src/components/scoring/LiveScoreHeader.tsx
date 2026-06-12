"use client";

import Link from "next/link";
import { ChevronLeft, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import type { InningsScore, BattingCard } from "@/domain/cricket/scorecard";
import type { BallEvent } from "@/domain/cricket/ball";

interface LiveScoreHeaderProps {
  score: InningsScore | null;
  /** The innings ball log, used to render the current over. */
  balls?: BallEvent[];
  battingTeamName?: string;
  /** Resolve a player id to a display name. */
  resolveName?: (id: string) => string;
  /** Back link target for the slim top bar. */
  backHref?: string;
  isLive?: boolean;
  /** When provided, renders an "Edit names" control in the batters panel. */
  onEditNames?: () => void;
  className?: string;
}

const noName = (id: string) => `Player ${id.slice(-4)}`;

/** Short label + color class for a single delivery, shown as an over chip. */
function ballChip(b: BallEvent): { label: string; cls: string } {
  if (b.wicket && b.wicket.type !== "retired_hurt") {
    return { label: "W", cls: "bg-wicket text-white" };
  }
  if (b.extraType === "wide") {
    // extraRuns includes the 1-run penalty; show the total when > 1 (e.g. "5Wd").
    return { label: b.extraRuns > 1 ? `${b.extraRuns}Wd` : "Wd", cls: "bg-extra text-black" };
  }
  if (b.extraType === "no_ball") {
    // Show runs off the bat on the no-ball when any (e.g. "4Nb").
    return { label: b.batRuns > 0 ? `${b.batRuns}Nb` : "Nb", cls: "bg-extra text-black" };
  }
  if (b.extraType === "bye") return { label: `${b.extraRuns}B`, cls: "bg-secondary text-secondary-foreground" };
  if (b.extraType === "leg_bye") return { label: `${b.extraRuns}Lb`, cls: "bg-secondary text-secondary-foreground" };
  if (b.batRuns === 4) return { label: "4", cls: "bg-four text-white" };
  if (b.batRuns === 6) return { label: "6", cls: "bg-six text-white" };
  if (b.batRuns === 0) return { label: "•", cls: "bg-muted text-muted-foreground" };
  return { label: String(b.batRuns), cls: "bg-secondary text-secondary-foreground" };
}

function BatterRow({
  card,
  name,
  onStrike,
}: {
  card: BattingCard | null;
  name: string;
  onStrike: boolean;
}) {
  const runs = card?.runs ?? 0;
  const balls = card?.ballsFaced ?? 0;
  const sr = card?.strikeRate ?? 0;
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="flex min-w-0 items-center gap-1.5">
        {onStrike && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-four"
            aria-label="on strike"
          />
        )}
        <span className={cn("truncate", onStrike ? "font-semibold" : "")}>
          {name}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3 tabular-nums">
        <span className="font-semibold">
          {runs}
          <span className="ml-0.5 text-xs font-normal text-muted-foreground">
            ({balls})
          </span>
        </span>
        <span className="w-12 text-right text-xs text-muted-foreground">
          SR {sr.toFixed(0)}
        </span>
      </span>
    </div>
  );
}

/**
 * LiveScoreHeader — the scoreboard at the top of the live scoring screen.
 *
 * Combines the slim navigation bar, the headline score + run rates, the
 * batters at the crease, the current bowler's figures, and the current over —
 * everything a scorer needs to keep their bearings, in one compact block.
 */
export function LiveScoreHeader({
  score,
  balls = [],
  battingTeamName = "Batting",
  resolveName = noName,
  backHref,
  isLive = true,
  onEditNames,
  className,
}: LiveScoreHeaderProps) {
  const runs = score?.runs ?? 0;
  const wickets = score?.wickets ?? 0;
  const oversText = score?.oversText ?? "0.0";
  const runRate = score?.runRate ?? 0;
  const rrr = score?.requiredRunRate ?? null;
  const target = score?.target ?? null;
  const runsRequired = score?.runsRequired ?? null;
  const ballsRemaining = score?.ballsRemaining ?? null;

  const strikerId = score?.strikerId ?? null;
  const nonStrikerId = score?.nonStrikerId ?? null;
  const bowlerId = score?.currentBowlerId ?? null;

  const cardOf = (id: string | null): BattingCard | null =>
    id ? (score?.battingCards.find((c) => c.player === id) ?? null) : null;
  const bowlerCard = bowlerId
    ? (score?.bowlingCards.find((c) => c.player === bowlerId) ?? null)
    : null;

  // Current over chips: balls whose over matches the last recorded over.
  const currentOverNo = balls.length ? balls[balls.length - 1]!.over : 0;
  const thisOver = balls.filter((b) => b.over === currentOverNo);

  return (
    <header className={cn("bg-primary text-primary-foreground", className)}>
      {/* Slim nav bar */}
      <div className="flex h-12 items-center gap-2 px-2">
        {backHref && (
          <Link
            href={backHref}
            className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-primary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/40"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
        )}
        <span className="flex-1 truncate text-sm font-medium opacity-90">
          {battingTeamName}
        </span>
        {isLive && (
          <span className="flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-semibold">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" aria-hidden="true" />
            LIVE
          </span>
        )}
      </div>

      {/* Headline score */}
      <div className="flex items-end justify-between gap-3 px-4 pb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-bold leading-none tabular-nums">
            {runs}
            <span className="opacity-80">/{wickets}</span>
          </span>
          <span className="text-base opacity-80">({oversText})</span>
        </div>
        <div className="text-right text-xs leading-snug opacity-90">
          <div>
            CRR <span className="font-bold tabular-nums">{runRate.toFixed(2)}</span>
          </div>
          {rrr !== null && (
            <div>
              RRR <span className="font-bold tabular-nums">{rrr.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Chase line */}
      {target !== null && runsRequired !== null && runsRequired > 0 && (
        <div className="bg-primary-foreground/10 px-4 py-1.5 text-center text-xs font-medium">
          Need {runsRequired} from {ballsRemaining} balls · Target {target}
        </div>
      )}

      {/* Batters + bowler panel */}
      <div className="space-y-2 rounded-t-2xl bg-card px-4 pb-3 pt-2.5 text-card-foreground">
        {onEditNames && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onEditNames}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              Edit names
            </button>
          </div>
        )}
        <div className="divide-y divide-border/60">
          <BatterRow
            card={cardOf(strikerId)}
            name={strikerId ? resolveName(strikerId) : "Batter 1"}
            onStrike
          />
          <BatterRow
            card={cardOf(nonStrikerId)}
            name={nonStrikerId ? resolveName(nonStrikerId) : "Batter 2"}
            onStrike={false}
          />
        </div>

        <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm">
          <span className="truncate text-muted-foreground">
            {bowlerId ? resolveName(bowlerId) : "Bowler"}
          </span>
          <span className="shrink-0 font-semibold tabular-nums">
            {bowlerCard
              ? `${bowlerCard.oversText}–${bowlerCard.maidens}–${bowlerCard.runsConceded}–${bowlerCard.wickets}`
              : "0.0–0–0–0"}
          </span>
        </div>

        {/* This over */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs font-medium text-muted-foreground">This over</span>
          <div className="flex flex-wrap gap-1">
            {thisOver.length === 0 ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              thisOver.map((b) => {
                const { label, cls } = ballChip(b);
                return (
                  <span
                    key={b.id}
                    className={cn(
                      "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold",
                      cls,
                    )}
                  >
                    {label}
                  </span>
                );
              })
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
