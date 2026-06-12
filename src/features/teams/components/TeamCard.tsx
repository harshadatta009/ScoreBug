import * as React from "react";
import Link from "next/link";
import { MapPin, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Team } from "@/lib/repositories/teamRepository";

interface TeamCardProps {
  team: Team;
  /** Extra CSS classes. */
  className?: string;
  /** When true, badge indicating the user is a member/owner is shown. */
  isMine?: boolean;
}

/**
 * TeamCard — compact card linking to the team profile.
 *
 * Renders logo (or initials fallback), name, location and an optional
 * "My team" badge. Used in both the browse list and the "My teams" section.
 */
export function TeamCard({ team, className, isMine }: TeamCardProps) {
  const initials = team.shortName?.slice(0, 3).toUpperCase() ?? team.name.slice(0, 2).toUpperCase();

  return (
    <Link
      href={`/teams/${team.id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40 active:bg-accent/60",
        className,
      )}
    >
      {/* Logo / initials */}
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary"
        aria-hidden="true"
      >
        {team.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={team.logoUrl}
            alt={`${team.name} logo`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm font-bold">{initials}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold leading-tight">{team.name}</p>
          {isMine && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              Mine
            </Badge>
          )}
        </div>

        {(team.city ?? team.country) && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            {[team.city, team.country].filter(Boolean).join(", ")}
          </p>
        )}
      </div>

      <Users
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
