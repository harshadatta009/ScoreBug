import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/shared/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth/session";
import { asId } from "@/domain/shared/ids";
import { getTournament } from "@/lib/repositories/tournamentRepository";
import { TournamentForm } from "@/features/tournaments/components/TournamentForm";

interface Props {
  params: Promise<{ tournamentId: string }>;
}

export const metadata = { title: "Edit Tournament" };

/**
 * Edit tournament page.
 *
 * Auth-guarded: unauthenticated users → /login.
 * Organizer-gated: only the tournament's organizer can see this page; anyone
 * else is bounced back to the tournament detail (not a 403, to avoid leaking
 * existence — but the tournament IS public so 404 would be odd).
 */
export default async function EditTournamentPage({ params }: Props) {
  const { tournamentId } = await params;
  const id = asId<"TournamentId">(tournamentId);

  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=/tournaments/${tournamentId}/edit`);

  const tournament = await getTournament(id);
  if (!tournament) notFound();

  // Non-organizer: redirect to the detail page (action-layer also enforces this).
  if (tournament.organizerId !== user.id) {
    redirect(`/tournaments/${tournamentId}`);
  }

  return (
    <>
      <AppHeader
        title="Edit Tournament"
        backHref={`/tournaments/${tournamentId}`}
      />

      <div className="container mx-auto max-w-lg px-4 py-6">
        <Card>
          <CardContent className="pt-6">
            <TournamentForm
              tournamentId={tournamentId}
              defaultValues={{
                name: tournament.name,
                format: tournament.format,
                matchFormat: tournament.matchFormat,
                startDate: tournament.startDate ?? undefined,
                endDate: tournament.endDate ?? undefined,
                isPublic: tournament.isPublic,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
