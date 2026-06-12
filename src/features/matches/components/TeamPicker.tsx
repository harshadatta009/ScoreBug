"use client";

import type { TeamId } from "@/domain/shared/ids";
import { cn } from "@/lib/utils";

/** A selectable team option (id + display name). */
export interface TeamOption {
  id: TeamId;
  name: string;
  shortName?: string | null;
}

/**
 * Radio-style team picker. `disabledId` greys out the team already chosen for
 * the other side so a match can't be created with the same team twice.
 */
export function TeamPicker({
  label,
  teams,
  value,
  onChange,
  disabledId,
}: {
  label: string;
  teams: TeamOption[];
  value: TeamId | null;
  onChange: (id: TeamId) => void;
  disabledId?: TeamId | null;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {teams.map((t) => {
          const selected = value === t.id;
          const disabled = disabledId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(t.id)}
              className={cn(
                "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                selected
                  ? "border-primary bg-primary/10 font-medium"
                  : "border-border hover:bg-accent",
                disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
              )}
            >
              <span className="block truncate">{t.name}</span>
              {t.shortName && (
                <span className="block text-xs text-muted-foreground">
                  {t.shortName}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
