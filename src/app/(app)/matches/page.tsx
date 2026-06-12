import Link from "next/link";
import { Plus } from "lucide-react";

import { reduceInnings } from "@/domain/cricket/engine";
import type { MatchStatus } from "@/domain/cricket/enums";
import { DEFAULT_T20_RULES } from "@/domain/cricket/match";
import { AppHeader } from "@/components/shared/AppHeader";
import { Button } from "@/components/ui/button";
import { getBallsForInnings } from "@/lib/repositories/ballRepository";
import { getInningsByMatch } from "@/lib/repositories/inningsRepository";
import {
  listMatches,
  type MatchListItem,
} from "@/lib/repositories/matchRepository";
import { getTeamsByIds, type Team } from "@/lib/repositories/teamRepository";

import {
  MatchCard,
  type MatchCardScores,
} from "@/features/matches/components/MatchCard";

export const metadata = { title: "Matches" };

// Always reflect the latest lifecycle state (live scores change frequently).
export const dynamic = "force-dynamic";

/** Which status bucket a match belongs to in the grouped list. */
function bucketOf(status: MatchStatus): "live" | "upcoming" | "completed" {
  if (
    status === "in_progress" ||
    status === "innings_break" ||
    status === "super_over"
  ) {
    return "live";
  }
  if (
    status === "completed" ||
    status === "abandoned" ||
    status === "no_result"
  ) {
    return "completed";
  }
  return "upcoming";
}

/**
 * Per-side score summary for live/completed matches, by replaying each innings
 * through the engine. The summary string ("142/6 (20.0)") depends only on runs,
 * wickets and over count, so the default rules' ballsPerOver is sufficient here.
 * Best-effort: any failure yields no summary rather than breaking the list.
 */
async function buildScores(
  match: MatchListItem,
): Promise<MatchCardScores | undefined> {
  if (bucketOf(match.status) === "upcoming") return undefined;
  try {
    const innings = await getInningsByMatch(match.id);
    if (innings.length === 0) return undefined;

    const scores: MatchCardScores = {};
    for (const cfg of innings) {
      const balls = await getBallsForInnings(cfg.id);
      const s = reduceInnings(cfg, DEFAULT_T20_RULES, balls);
      const summary = `${s.runs}/${s.wickets} (${s.oversText})`;
      if (cfg.battingTeam === match.teamAId) scores.teamA = summary;
      else if (cfg.battingTeam === match.teamBId) scores.teamB = summary;
    }
    return scores;
  } catch {
    return undefined;
  }
}

function Section({
  title,
  matches,
  teamsById,
  scoresByMatch,
}: {
  title: string;
  matches: MatchListItem[];
  teamsById: Map<string, Team>;
  scoresByMatch: Map<string, MatchCardScores | undefined>;
}) {
  if (matches.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-2">
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            teamAName={teamsById.get(m.teamAId)?.name ?? "Team A"}
            teamBName={teamsById.get(m.teamBId)?.name ?? "Team B"}
            scores={scoresByMatch.get(m.id)}
          />
        ))}
      </div>
    </section>
  );
}

export default async function MatchesPage() {
  const matches = await listMatches();

  // Batch-resolve every team name in one query.
  const teamIds = Array.from(
    new Set(matches.flatMap((m) => [m.teamAId, m.teamBId])),
  );
  const teams = await getTeamsByIds(teamIds);
  const teamsById = new Map(teams.map((t) => [t.id as string, t]));

  // Resolve score summaries (live/completed only), keyed by match id.
  const scoreEntries = await Promise.all(
    matches.map(async (m) => [m.id as string, await buildScores(m)] as const),
  );
  const scoresByMatch = new Map(scoreEntries);

  const live = matches.filter((m) => bucketOf(m.status) === "live");
  const upcoming = matches.filter((m) => bucketOf(m.status) === "upcoming");
  const completed = matches.filter((m) => bucketOf(m.status) === "completed");

  return (
    <>
      <AppHeader
        title="Matches"
        actions={
          <Button asChild size="sm">
            <Link href="/matches/new">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              New
            </Link>
          </Button>
        }
      />

      <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
        {matches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
            <p className="font-semibold">No matches yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              Create a match to set up teams, record the toss and start scoring.
            </p>
            <Button asChild className="mt-4">
              <Link href="/matches/new">
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Create match
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <Section
              title="Live"
              matches={live}
              teamsById={teamsById}
              scoresByMatch={scoresByMatch}
            />
            <Section
              title="Upcoming"
              matches={upcoming}
              teamsById={teamsById}
              scoresByMatch={scoresByMatch}
            />
            <Section
              title="Completed"
              matches={completed}
              teamsById={teamsById}
              scoresByMatch={scoresByMatch}
            />
          </>
        )}
      </div>
    </>
  );
}
