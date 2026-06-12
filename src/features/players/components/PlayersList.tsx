"use client";

import { useState } from "react";
import { Search, Users } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlayers } from "@/features/players/queries";
import { PlayerCard } from "./PlayerCard";

/**
 * PlayersList — interactive client component for the /players directory page.
 * Holds local search state and delegates fetching to `usePlayers`.
 */
export function PlayersList() {
  const [search, setSearch] = useState("");
  const { data: players, isLoading, isError } = usePlayers(search);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search players…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search players by name"
        />
      </div>

      {/* Loading state */}
      {isLoading && (
        <ul className="space-y-2" aria-label="Loading players">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-[68px] w-full rounded-xl" />
            </li>
          ))}
        </ul>
      )}

      {/* Error state */}
      {isError && (
        <p className="py-8 text-center text-sm text-destructive">
          Failed to load players. Please try again.
        </p>
      )}

      {/* Empty state */}
      {!isLoading && !isError && players?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold">No players found</p>
            <p className="mx-auto max-w-xs text-sm text-muted-foreground">
              {search
                ? `No players match "${search}". Try a different search.`
                : "No player profiles have been created yet."}
            </p>
          </div>
        </div>
      )}

      {/* Player list */}
      {!isLoading && !isError && (players?.length ?? 0) > 0 && (
        <ul className="space-y-2" aria-label="Player list">
          {players!.map((player) => (
            <li key={player.id}>
              <PlayerCard player={player} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
