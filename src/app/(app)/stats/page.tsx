import { Trophy } from "lucide-react";

import { AppHeader } from "@/components/shared/AppHeader";
import { StatTabs } from "@/features/stats/components/StatTabs";
import { loadLeaderboards } from "@/features/stats/loader";

export const metadata = { title: "Stats & Leaderboards" };

/**
 * Statistics hub — public read.
 *
 * A Server Component that loads all four leaderboards (batting, bowling,
 * fielding, MVP) up front from the cached `player_statistics` table, then hands
 * them to a client tab switcher so changing boards is instant. Anyone may view
 * stats, so there is no auth guard here.
 */
export default async function StatsPage() {
  const data = await loadLeaderboards();

  return (
    <>
      <AppHeader title="Stats & Leaderboards" />

      <div className="container mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Trophy className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">
              Leaderboards
            </h2>
            <p className="text-sm text-muted-foreground">
              Career rankings across all scored matches.
            </p>
          </div>
        </div>

        <StatTabs data={data} />
      </div>
    </>
  );
}
