import * as React from "react";
import Link from "next/link";
import { Plus, Users } from "lucide-react";

import { AppHeader } from "@/components/shared/AppHeader";
import { Button } from "@/components/ui/button";
import { getUser } from "@/lib/auth/session";
import { asId } from "@/domain/shared/ids";
import { listMyTeams, listTeams } from "@/lib/repositories/teamRepository";
import { TeamCard } from "@/features/teams/components/TeamCard";

export const metadata = { title: "Teams" };

/**
 * Teams list page.
 *
 * Shows:
 * - "My teams" section for authenticated users (teams they own or belong to).
 * - "Browse all teams" section for everyone.
 *
 * Intentionally a Server Component so the two queries run on the server
 * without a round-trip; no suspense boundary needed at this scale.
 */
export default async function TeamsPage() {
  const user = await getUser();

  const [myTeams, allTeams] = await Promise.all([
    user ? listMyTeams(asId<"UserId">(user.id)) : Promise.resolve([]),
    listTeams({ limit: 40 }),
  ]);

  // Set of team ids the user is already a member of, for badge display.
  const myTeamIds = new Set(myTeams.map((t) => t.id as string));

  return (
    <>
      <AppHeader
        title="Teams"
        actions={
          user ? (
            <Button size="sm" asChild>
              <Link href="/teams/new">
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                New
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="container mx-auto max-w-2xl space-y-8 px-4 py-6">
        {/* My teams */}
        {user && (
          <section aria-labelledby="my-teams-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2
                id="my-teams-heading"
                className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
              >
                My teams
              </h2>
            </div>

            {myTeams.length > 0 ? (
              <div className="space-y-2">
                {myTeams.map((team) => (
                  <TeamCard key={team.id} team={team} isMine />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold">
                    You&apos;re not in any teams yet
                  </p>
                  <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                    Create a team or browse below and request to join an
                    existing one.
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link href="/teams/new">
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Create team
                  </Link>
                </Button>
              </div>
            )}
          </section>
        )}

        {/* Browse all */}
        <section aria-labelledby="all-teams-heading">
          <h2
            id="all-teams-heading"
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            All teams
          </h2>

          {allTeams.length > 0 ? (
            <div className="space-y-2">
              {allTeams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  isMine={myTeamIds.has(team.id as string)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
              <Users
                className="h-10 w-10 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-semibold">No teams yet</p>
                <p className="text-sm text-muted-foreground">
                  Be the first to create a team!
                </p>
              </div>
              {user && (
                <Button asChild size="sm">
                  <Link href="/teams/new">
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Create team
                  </Link>
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
