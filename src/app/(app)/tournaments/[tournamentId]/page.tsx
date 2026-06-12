import { notFound } from "next/navigation";

import { AppHeader } from "@/components/shared/AppHeader";
import { getUser } from "@/lib/auth/session";
import { asId } from "@/domain/shared/ids";
import { getTournament } from "@/lib/repositories/tournamentRepository";
import { TournamentHub } from "./TournamentHub";

interface Props {
  params: Promise<{ tournamentId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { tournamentId } = await params;
  const tournament = await getTournament(asId<"TournamentId">(tournamentId));
  return { title: tournament?.name ?? "Tournament" };
}

/**
 * Tournament detail hub page — public read.
 *
 * Fetches the tournament server-side for SSR (metadata + initial paint) and
 * passes `isOrganizer` to the client TournamentHub so it can show/hide
 * organizer-only controls without an extra round-trip.
 */
export default async function TournamentPage({ params }: Props) {
  const { tournamentId } = await params;
  const id = asId<"TournamentId">(tournamentId);

  const [tournament, user] = await Promise.all([
    getTournament(id),
    getUser(),
  ]);

  if (!tournament) notFound();

  const isOrganizer = !!user && user.id === tournament.organizerId;

  return (
    <>
      <AppHeader title={tournament.name} backHref="/tournaments" />
      <TournamentHub tournament={tournament} isOrganizer={isOrganizer} />
    </>
  );
}
