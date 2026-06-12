import * as React from "react";
import Link from "next/link";
import { Calendar, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Tournament } from "@/features/tournaments/types";

interface TournamentCardProps {
  tournament: Tournament;
  className?: string;
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
 * TournamentCard — compact summary card linking to the tournament hub.
 */
export function TournamentCard({ tournament, className }: TournamentCardProps) {
  const start = formatDate(tournament.startDate);
  const end = formatDate(tournament.endDate);
  const dateRange = start && end ? `${start} – ${end}` : start || end || null;

  return (
    <Link href={`/tournaments/${tournament.id}`} className="group block">
      <Card
        className={cn(
          "h-full transition-colors group-hover:border-primary/50 group-focus-visible:border-primary/50",
          className,
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Trophy className="h-4 w-4" aria-hidden="true" />
              </div>
              <CardTitle className="line-clamp-2 text-sm leading-snug">
                {tournament.name}
              </CardTitle>
            </div>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {FORMAT_LABEL[tournament.format]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {tournament.matchFormat}
            </span>
            {dateRange && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" aria-hidden="true" />
                {dateRange}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
