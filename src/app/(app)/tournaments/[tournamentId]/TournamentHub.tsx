"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Settings, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { FixtureList } from "@/features/tournaments/components/FixtureList";
import { PointsTable } from "@/features/tournaments/components/PointsTable";
import { RegisterTeamDialog } from "@/features/tournaments/components/RegisterTeamDialog";
import { StandingsRow } from "@/features/tournaments/components/StandingsRow";
import {
  useRegisteredTeams,
  useFixtures,
  usePointsTable,
  useGenerateFixtures,
} from "@/features/tournaments/queries";
import type { Tournament } from "@/features/tournaments/types";

interface TournamentHubProps {
  tournament: Tournament;
  isOrganizer: boolean;
}

const FORMAT_LABEL: Record<Tournament["format"], string> = {
  league: "League",
  knockout: "Knockout",
  round_robin: "Round Robin",
  league_playoffs: "League + Playoffs",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * TournamentHub — client component that owns the tabbed layout of the
 * tournament detail page. Receives tournament data from the Server Component
 * parent (already fetched) and lazily loads tab content on demand.
 */
export function TournamentHub({ tournament, isOrganizer }: TournamentHubProps) {
  const start = formatDate(tournament.startDate);
  const end = formatDate(tournament.endDate);
  const dateRange = start && end ? `${start} – ${end}` : start || end || null;

  return (
    <div className="space-y-4">
      {/* Tournament header banner */}
      <div className="bg-card px-4 py-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-14 w-14 shrink-0 rounded-xl">
            {tournament.logoUrl && (
              <AvatarImage src={tournament.logoUrl} alt={tournament.name} />
            )}
            <AvatarFallback className="rounded-xl text-lg font-bold">
              {tournament.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <h1 className="line-clamp-2 text-lg font-bold leading-snug">
              {tournament.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant="secondary">
                {FORMAT_LABEL[tournament.format]}
              </Badge>
              <Badge variant="outline">{tournament.matchFormat}</Badge>
              {dateRange && (
                <span className="text-xs text-muted-foreground">{dateRange}</span>
              )}
            </div>
          </div>
          {isOrganizer && (
            <Button size="icon" variant="ghost" asChild aria-label="Edit tournament">
              <Link href={`/tournaments/${tournament.id}/edit`}>
                <Settings className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="px-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="overview" className="flex-1 sm:flex-none">
            Overview
          </TabsTrigger>
          <TabsTrigger value="teams" className="flex-1 sm:flex-none">
            Teams
          </TabsTrigger>
          <TabsTrigger value="fixtures" className="flex-1 sm:flex-none">
            Fixtures
          </TabsTrigger>
          <TabsTrigger value="points" className="flex-1 sm:flex-none">
            Points
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          <OverviewTab tournament={tournament} isOrganizer={isOrganizer} />
        </TabsContent>

        <TabsContent value="teams" className="mt-3">
          <TeamsTab tournamentId={tournament.id} isOrganizer={isOrganizer} />
        </TabsContent>

        <TabsContent value="fixtures" className="mt-3">
          <FixturesTab tournamentId={tournament.id} isOrganizer={isOrganizer} />
        </TabsContent>

        <TabsContent value="points" className="mt-3">
          <PointsTab tournamentId={tournament.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab panels ───────────────────────────────────────────────────────────────

function OverviewTab({
  tournament,
  isOrganizer,
}: {
  tournament: Tournament;
  isOrganizer: boolean;
}) {
  const { data: pointsRows, isLoading } = usePointsTable(tournament.id);

  return (
    <div className="space-y-4">
      {/* Quick standings widget */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Standings</h2>
          <span className="text-xs text-muted-foreground">Pts / NRR</span>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !pointsRows || pointsRows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            No results yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {pointsRows.slice(0, 4).map((row, idx) => (
              <StandingsRow key={row.teamId} row={row} position={idx + 1} />
            ))}
          </div>
        )}
      </div>

      {/* Organizer: Generate fixtures CTA */}
      {isOrganizer && (
        <GenerateFixturesCta tournamentId={tournament.id} />
      )}
    </div>
  );
}

function GenerateFixturesCta({ tournamentId }: { tournamentId: string }) {
  const { mutate, isPending, isSuccess, isError, error } =
    useGenerateFixtures();
  const [done, setDone] = React.useState(false);

  function handleGenerate() {
    mutate(tournamentId, { onSuccess: () => setDone(true) });
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-4 text-center">
      <Zap className="mx-auto mb-2 h-6 w-6 text-primary" aria-hidden="true" />
      <p className="mb-1 text-sm font-medium">Generate fixtures</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Automatically create all matches for this tournament.
      </p>
      {done || isSuccess ? (
        <p className="text-sm font-medium text-green-600 dark:text-green-400">
          Fixtures generated! Switch to the Fixtures tab.
        </p>
      ) : (
        <>
          <Button size="sm" onClick={handleGenerate} disabled={isPending}>
            {isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Generate
          </Button>
          {isError && (
            <p className="mt-2 text-xs text-destructive">
              {error instanceof Error ? error.message : "Failed."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TeamsTab({
  tournamentId,
  isOrganizer,
}: {
  tournamentId: string;
  isOrganizer: boolean;
}) {
  const { data: teams, isLoading } = useRegisteredTeams(tournamentId);

  return (
    <div className="space-y-3">
      {isOrganizer && (
        <div className="flex justify-end">
          <RegisterTeamDialog tournamentId={tournamentId} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : !teams || teams.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No teams registered yet.
          {isOrganizer && " Use the button above to add teams."}
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Registered teams">
          {teams.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <Avatar className="h-9 w-9 shrink-0">
                {t.team.logoUrl && (
                  <AvatarImage src={t.team.logoUrl} alt={t.team.name} />
                )}
                <AvatarFallback className="text-xs font-semibold">
                  {(t.team.shortName ?? t.team.name).slice(0, 3).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium">{t.team.name}</p>
                {t.groupName && (
                  <p className="text-xs text-muted-foreground">{t.groupName}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FixturesTab({
  tournamentId,
  isOrganizer,
}: {
  tournamentId: string;
  isOrganizer: boolean;
}) {
  const { data: fixtures, isLoading } = useFixtures(tournamentId);

  return (
    <div>
      {isOrganizer && (!fixtures || fixtures.length === 0) && !isLoading && (
        <div className="mb-4">
          <GenerateFixturesCta tournamentId={tournamentId} />
        </div>
      )}
      <div className="rounded-lg border border-border bg-card">
        <FixtureList fixtures={fixtures ?? []} isLoading={isLoading} />
      </div>
    </div>
  );
}

function PointsTab({ tournamentId }: { tournamentId: string }) {
  const { data: rows, isLoading } = usePointsTable(tournamentId);

  return (
    <div className="rounded-lg border border-border bg-card">
      <PointsTable rows={rows ?? []} isLoading={isLoading} />
    </div>
  );
}
