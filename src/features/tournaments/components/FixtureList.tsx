"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Fixture } from "@/features/tournaments/types";

interface FixtureListProps {
  fixtures: Fixture[];
  isLoading?: boolean;
}

const STATUS_BADGE: Record<
  Fixture["status"],
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  scheduled: { label: "Scheduled", variant: "outline" },
  toss: { label: "Toss", variant: "secondary" },
  in_progress: { label: "Live", variant: "default" },
  innings_break: { label: "Break", variant: "secondary" },
  rain_delay: { label: "Rain", variant: "secondary" },
  super_over: { label: "Super Over", variant: "default" },
  completed: { label: "Completed", variant: "secondary" },
  abandoned: { label: "Abandoned", variant: "destructive" },
  no_result: { label: "No Result", variant: "destructive" },
};

function formatScheduled(iso: string | null): string {
  if (!iso) return "TBC";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stageName(stage: string | null, round: number | null): string {
  if (stage === "final") return "Final";
  if (stage === "semi_final") return "Semi-Finals";
  if (stage === "quarter_final") return "Quarter-Finals";
  if (stage === "league") return `Round ${round ?? ""}`;
  if (stage) return stage.replace(/_/g, " ");
  return `Round ${round ?? ""}`;
}

/**
 * FixtureList — fixtures grouped by round / stage.
 */
export function FixtureList({ fixtures, isLoading }: FixtureListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3 px-4 py-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (fixtures.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        No fixtures yet. The organizer can generate fixtures from the Overview tab.
      </p>
    );
  }

  // Group by round → stage.
  const groups = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const key = stageName(f.stage, f.round);
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }

  return (
    <div className="divide-y divide-border">
      {[...groups.entries()].map(([label, items]) => (
        <section key={label} className="py-3">
          <h3 className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </h3>
          <ul className="space-y-2 px-4">
            {items.map((f) => (
              <FixtureRow key={f.id} fixture={f} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FixtureRow({ fixture: f }: { fixture: Fixture }) {
  const badge = STATUS_BADGE[f.status] ?? {
    label: f.status,
    variant: "outline" as const,
  };
  const isCompleted = f.status === "completed";

  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        {/* Teams */}
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <div className="flex flex-1 flex-col gap-0.5">
            <span
              className={cn(
                "truncate text-sm font-medium",
                isCompleted && f.winnerTeamId === f.teamAId
                  ? "text-green-600 dark:text-green-400"
                  : "",
              )}
            >
              {f.teamAName}
            </span>
            <span className="text-xs text-muted-foreground">vs</span>
            <span
              className={cn(
                "truncate text-sm font-medium",
                isCompleted && f.winnerTeamId === f.teamBId
                  ? "text-green-600 dark:text-green-400"
                  : "",
              )}
            >
              {f.teamBName}
            </span>
          </div>
        </div>

        {/* Right side: status + date */}
        <div className="flex flex-col items-end gap-1">
          <Badge variant={badge.variant} className="shrink-0 text-xs">
            {badge.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatScheduled(f.scheduledAt)}
          </span>
        </div>
      </div>

      {/* Result summary */}
      {f.resultSummary && (
        <p className="mt-1.5 text-xs text-muted-foreground">{f.resultSummary}</p>
      )}
    </li>
  );
}
