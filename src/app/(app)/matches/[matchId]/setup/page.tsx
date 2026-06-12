import { notFound, redirect } from "next/navigation";

import { asId } from "@/domain/shared/ids";
import { AppHeader } from "@/components/shared/AppHeader";
import { getUser } from "@/lib/auth/session";
import { getMatchDetail } from "@/lib/repositories/matchRepository";
import { getTeamsByIds } from "@/lib/repositories/teamRepository";

import { MatchSetupForm } from "@/features/matches/components/MatchSetupForm";
import { getTeamSquad } from "@/features/matches/data";

export const metadata = { title: "Match setup" };
export const dynamic = "force-dynamic";

export default async function MatchSetupPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId: raw } = await params;
  const matchId = asId<"MatchId">(raw);

  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=/matches/${raw}/setup`);

  const detail = await getMatchDetail(matchId);
  if (!detail) notFound();

  // Only the scorer/creator may run setup.
  if (detail.scorerId !== user.id && detail.createdBy !== user.id) {
    redirect(`/matches/${raw}`);
  }

  const teamAId = detail.config.teamA.teamId;
  const teamBId = detail.config.teamB.teamId;

  const [teams, squadA, squadB] = await Promise.all([
    getTeamsByIds([teamAId, teamBId]),
    getTeamSquad(teamAId),
    getTeamSquad(teamBId),
  ]);
  const nameOf = (id: string) =>
    teams.find((t) => (t.id as string) === id)?.name ?? "Team";

  return (
    <>
      <AppHeader title="Match setup" backHref={`/matches/${raw}`} />
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <MatchSetupForm
          matchId={matchId}
          teamA={{ teamId: teamAId, name: nameOf(teamAId), squad: squadA }}
          teamB={{ teamId: teamBId, name: nameOf(teamBId), squad: squadB }}
          initialTossWonBy={detail.config.toss?.wonBy ?? null}
          initialTossDecision={detail.config.toss?.decision ?? null}
        />
      </div>
    </>
  );
}
