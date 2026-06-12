"use client";

import type { UserId } from "@/domain/shared/ids";
import type { SquadMember } from "@/features/matches/data";
import { cn } from "@/lib/utils";

/** A selected XI member, in batting order (index + 1). */
export interface SelectedMember {
  userId: UserId;
}

/**
 * Multi-select squad list for a single side. Selection order becomes the
 * batting order, which the setup form maps to `PlayingXIMember.battingOrder`.
 */
export function PlayingXISelector({
  teamName,
  squad,
  selected,
  onToggle,
  max = 11,
}: {
  teamName: string;
  squad: SquadMember[];
  selected: UserId[];
  onToggle: (userId: UserId) => void;
  max?: number;
}) {
  const orderOf = (userId: UserId) => selected.indexOf(userId);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{teamName}</h3>
        <span className="text-xs text-muted-foreground">
          {selected.length}/{max}
        </span>
      </div>

      {squad.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          This team has no squad members yet. Add players to the team first.
        </p>
      ) : (
        <ul className="space-y-1">
          {squad.map((m) => {
            const idx = orderOf(m.userId);
            const isSelected = idx >= 0;
            const atCapacity = !isSelected && selected.length >= max;
            return (
              <li key={m.userId}>
                <button
                  type="button"
                  disabled={atCapacity}
                  aria-pressed={isSelected}
                  onClick={() => onToggle(m.userId)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent",
                    atCapacity && "cursor-not-allowed opacity-40",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {isSelected && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground tabular-nums">
                        {idx + 1}
                      </span>
                    )}
                    <span className="truncate font-medium">
                      {m.displayName}
                    </span>
                  </span>
                  {m.jerseyNumber !== null && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      #{m.jerseyNumber}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
