import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayCircle, Settings2 } from "lucide-react";

import { reduceInnings } from "@/domain/cricket/engine";
import type { InningsScore } from "@/domain/cricket/scorecard";
import { asId, type PlayerId } from "@/domain/shared/ids";
import { AppHeader } from "@/components/shared/AppHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getBallsForInnings } from "@/lib/repositories/ballRepository";
import { getPlayerNames } from "@/lib/repositories/inningsRepository";
import { getMatchDetail } from "@/lib/repositories/matchRepository";
import { getTeamsByIds } from "@/lib/repositories/teamRepository";
import { getUser } from "@/lib/auth/session";

import { MatchResultBanner } from "@/features/matches/components/MatchResultBanner";
import { ScorecardTable } from "@/features/matches/components/ScorecardTable";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return { title: `Match ${matchId.slice(0, 8)}` };
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled — not started",
  toss: "Toss done — awaiting start",
  in_progress: "Match in progress",
  innings_break: "Innings break",
  rain_delay: "Rain delay",
  super_over: "Super over",
  completed: "Completed",
  abandoned: "Abandoned",
  no_result: "No result",
};

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId: raw } = await params;
  const matchId = asId<"MatchId">(raw);

  const detail = await getMatchDetail(matchId);
  if (!detail) notFound();

  const { config, innings } = detail;
  const rules = config.rules;

  const [teams, user] = await Promise.all([
    getTeamsByIds([config.teamA.teamId, config.teamB.teamId]),
    getUser(),
  ]);
  const teamName = (id: string) =>
    teams.find((t) => (t.id as string) === id)?.name ?? "Team";

  // Replay each innings through the engine off the persisted ball log.
  const scored: { score: InningsScore; battingName: string }[] = [];
  const allPlayerIds = new Set<PlayerId>();
  for (const cfg of innings) {
    const balls = await getBallsForInnings(cfg.id);
    const score = reduceInnings(cfg, rules, balls);
    score.battingCards.forEach((c) => allPlayerIds.add(c.player));
    score.bowlingCards.forEach((c) => allPlayerIds.add(c.player));
    scored.push({ score, battingName: teamName(cfg.battingTeam) });
  }

  const names = await getPlayerNames(Array.from(allPlayerIds));

  const isScorer =
    user != null &&
    (detail.scorerId === user.id || detail.createdBy === user.id);
  const winnerName = detail.winnerTeamId
    ? teamName(detail.winnerTeamId)
    : null;

  const tossLine = config.toss
    ? `${teamName(config.toss.wonBy)} won the toss and elected to ${config.toss.decision}`
    : null;

  return (
    <>
      <AppHeader
        title={`${teamName(config.teamA.teamId)} vs ${teamName(config.teamB.teamId)}`}
        backHref="/matches"
        actions={
          isScorer && config.status !== "completed" ? (
            <Button asChild size="sm" variant="ghost">
              <Link
                href={`/matches/${raw}/setup`}
                aria-label="Match setup"
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="container mx-auto max-w-2xl space-y-5 px-4 py-6">
        <MatchResultBanner
          summary={detail.resultSummary}
          winnerName={winnerName}
          statusLabel={STATUS_LABEL[config.status] ?? config.status}
        />

        {tossLine && (
          <p className="text-sm text-muted-foreground">{tossLine}</p>
        )}

        {isScorer && config.status !== "completed" && (
          <Button asChild className="w-full">
            <Link href={`/match/${raw}/score`}>
              <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              Score this match
            </Link>
          </Button>
        )}

        {scored.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No scorecard yet. The match hasn&apos;t started.
          </p>
        ) : (
          <Tabs defaultValue="0" className="w-full">
            <TabsList>
              {scored.map((s, i) => (
                <TabsTrigger key={i} value={String(i)}>
                  {s.battingName}
                </TabsTrigger>
              ))}
            </TabsList>
            {scored.map((s, i) => (
              <TabsContent key={i} value={String(i)} className="pt-4">
                <ScorecardTable
                  score={s.score}
                  battingTeamName={s.battingName}
                  names={names}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </>
  );
}
