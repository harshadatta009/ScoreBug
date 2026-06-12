import Link from "next/link";
import { Plus, Trophy } from "lucide-react";

import { AppHeader } from "@/components/shared/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth/session";
import { listTournaments } from "@/lib/repositories/tournamentRepository";
import { TournamentCard } from "@/features/tournaments/components/TournamentCard";

export const metadata = { title: "Tournaments" };

/**
 * Tournament list page.
 *
 * Server Component — data is fetched at render time. The create button is
 * shown to all authenticated users (any user can create a tournament — no
 * global-role gate per the authorization model).
 */
export default async function TournamentsPage() {
  const [user, tournaments] = await Promise.all([
    getUser(),
    listTournaments({ isPublic: true }),
  ]);

  return (
    <>
      <AppHeader
        title="Tournaments"
        actions={
          user ? (
            <Button size="sm" asChild>
              <Link href="/tournaments/new">
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                New
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="container mx-auto max-w-2xl px-4 py-6">
        {tournaments.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Trophy className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold">No tournaments yet</p>
                <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                  Tournaments let you run league tables, knockouts, and track
                  team standings with NRR.
                </p>
              </div>
              {user ? (
                <Button size="sm" asChild>
                  <Link href="/tournaments/new">Create the first tournament</Link>
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sign in to create a tournament.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {tournaments.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
