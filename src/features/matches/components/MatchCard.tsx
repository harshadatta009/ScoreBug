import Link from "next/link";

import type { MatchStatus } from "@/domain/cricket/enums";
import type { MatchListItem } from "@/lib/repositories/matchRepository";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/** Per-side score summary string, e.g. "142/6 (20)". Optional (upcoming matches). */
export interface MatchCardScores {
  teamA?: string | null;
  teamB?: string | null;
}

const STATUS_META: Record<
  MatchStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  scheduled: { label: "Upcoming", variant: "secondary" },
  toss: { label: "Toss", variant: "secondary" },
  in_progress: { label: "Live", variant: "destructive" },
  innings_break: { label: "Innings break", variant: "destructive" },
  rain_delay: { label: "Rain delay", variant: "outline" },
  super_over: { label: "Super over", variant: "destructive" },
  completed: { label: "Completed", variant: "outline" },
  abandoned: { label: "Abandoned", variant: "outline" },
  no_result: { label: "No result", variant: "outline" },
};

export function MatchCard({
  match,
  teamAName,
  teamBName,
  scores,
}: {
  match: MatchListItem;
  teamAName: string;
  teamBName: string;
  scores?: MatchCardScores;
}) {
  const meta = STATUS_META[match.status];

  return (
    <Link
      href={`/matches/${match.id}`}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
    >
      <Card className="p-4 transition-colors hover:bg-accent/40">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {match.format}
          </span>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>

        <div className="space-y-1.5">
          <Row name={teamAName} score={scores?.teamA} />
          <Row name={teamBName} score={scores?.teamB} />
        </div>

        {match.resultSummary && (
          <p className="mt-2 text-xs font-medium text-primary">
            {match.resultSummary}
          </p>
        )}
        {!match.resultSummary && match.scheduledAt && match.status === "scheduled" && (
          <p className="mt-2 text-xs text-muted-foreground">
            {new Date(match.scheduledAt).toLocaleString()}
          </p>
        )}
      </Card>
    </Link>
  );
}

function Row({ name, score }: { name: string; score?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate font-medium">{name}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {score ?? "—"}
      </span>
    </div>
  );
}
