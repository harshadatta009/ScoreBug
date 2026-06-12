import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Player } from "@/lib/repositories/playerRepository";

interface PlayerCardProps {
  player: Player;
  className?: string;
}

/** Human-readable label for a PlayerRoleEnum value. */
function roleLabel(role: Player["playerRole"]): string | null {
  if (!role) return null;
  const labels: Record<NonNullable<Player["playerRole"]>, string> = {
    batter: "Batter",
    bowler: "Bowler",
    all_rounder: "All-rounder",
    wicket_keeper: "Wicket-keeper",
    wk_batter: "WK-Batter",
  };
  return labels[role];
}

/** Two-letter initials from a display name. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * PlayerCard — compact card linking to a player's public profile page.
 * Used in the players directory list.
 */
export function PlayerCard({ player, className }: PlayerCardProps) {
  const role = roleLabel(player.playerRole);

  return (
    <Link
      href={`/players/${player.id}`}
      className={cn(
        "block rounded-xl transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={`View ${player.displayName}'s profile`}
    >
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <Avatar className="h-12 w-12 shrink-0">
            {player.photoUrl && (
              <AvatarImage src={player.photoUrl} alt={player.displayName} />
            )}
            <AvatarFallback>{initials(player.displayName)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-snug">
              {player.displayName}
            </p>
            {role && (
              <Badge variant="secondary" className="mt-1 text-xs">
                {role}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
