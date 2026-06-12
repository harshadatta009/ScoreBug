"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { MatchFormat } from "@/domain/cricket/enums";
import type { TeamId } from "@/domain/shared/ids";
import { createMatch } from "@/server/actions/match";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

import { TeamPicker, type TeamOption } from "./TeamPicker";

const FORMATS: MatchFormat[] = ["T10", "T20", "ODI", "TEST", "CUSTOM"];

/**
 * Create-match form. Picks two distinct teams, a format and an optional kickoff
 * time, calls the `createMatch` server action and routes to the setup flow on
 * success so the scorer can record the toss + XI next.
 */
export function CreateMatchForm({ teams }: { teams: TeamOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [teamA, setTeamA] = React.useState<TeamId | null>(null);
  const [teamB, setTeamB] = React.useState<TeamId | null>(null);
  const [format, setFormat] = React.useState<MatchFormat>("T20");
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamA || !teamB) {
      toast({ title: "Pick both teams", variant: "destructive" });
      return;
    }
    if (teamA === teamB) {
      toast({ title: "Teams must be different", variant: "destructive" });
      return;
    }

    startTransition(async () => {
      const res = await createMatch({
        format,
        teamAId: teamA,
        teamBId: teamB,
        scheduledAt: scheduledAt
          ? new Date(scheduledAt).toISOString()
          : null,
      });
      if (!res.ok || !res.data) {
        toast({
          title: "Could not create match",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      router.push(`/matches/${res.data.matchId}/setup`);
    });
  }

  if (teams.length < 2) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        You need at least two teams to create a match. Create teams first.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <TeamPicker
        label="Team A"
        teams={teams}
        value={teamA}
        onChange={setTeamA}
        disabledId={teamB}
      />
      <TeamPicker
        label="Team B"
        teams={teams}
        value={teamB}
        onChange={setTeamB}
        disabledId={teamA}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Format</legend>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={format === f}
              onClick={() => setFormat(f)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                format === f
                  ? "border-primary bg-primary/10 font-medium"
                  : "border-border hover:bg-accent",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="scheduledAt">Scheduled (optional)</Label>
        <Input
          id="scheduledAt"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create match"}
      </Button>
    </form>
  );
}
