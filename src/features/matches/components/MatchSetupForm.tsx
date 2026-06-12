"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { MatchId, TeamId, UserId } from "@/domain/shared/ids";
import type { TossDecision } from "@/domain/cricket/enums";
import type { SquadMember } from "@/features/matches/data";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

import {
  useSetPlayingXIMutation,
  useSetTossMutation,
  useStartMatchMutation,
} from "../queries";
import { PlayingXISelector } from "./PlayingXISelector";

interface SideInfo {
  teamId: TeamId;
  name: string;
  squad: SquadMember[];
}

/**
 * Three-step match setup: record the toss, pick both XIs, then start play.
 * Each step calls its dedicated server action via a mutation hook; we only
 * enable "Start match" once the toss and at least one player per side exist.
 * Selection order in the XI selector becomes batting order.
 */
export function MatchSetupForm({
  matchId,
  teamA,
  teamB,
  initialTossWonBy,
  initialTossDecision,
}: {
  matchId: MatchId;
  teamA: SideInfo;
  teamB: SideInfo;
  initialTossWonBy: TeamId | null;
  initialTossDecision: TossDecision | null;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [tossWonBy, setTossWonBy] = React.useState<TeamId | null>(
    initialTossWonBy,
  );
  const [tossDecision, setTossDecision] = React.useState<TossDecision | null>(
    initialTossDecision,
  );
  const [xiA, setXiA] = React.useState<UserId[]>([]);
  const [xiB, setXiB] = React.useState<UserId[]>([]);

  const tossMutation = useSetTossMutation(matchId);
  const xiMutation = useSetPlayingXIMutation(matchId);
  const startMutation = useStartMatchMutation(matchId);

  const toggle =
    (setter: React.Dispatch<React.SetStateAction<UserId[]>>) =>
    (userId: UserId) =>
      setter((prev) =>
        prev.includes(userId)
          ? prev.filter((id) => id !== userId)
          : [...prev, userId],
      );

  const tossReady = tossWonBy !== null && tossDecision !== null;
  const xiReady = xiA.length > 0 && xiB.length > 0;

  function toMembers(ids: UserId[]) {
    return ids.map((userId, i) => ({ userId, battingOrder: i + 1 }));
  }

  async function handleStart() {
    if (!tossReady) {
      toast({ title: "Record the toss first", variant: "destructive" });
      return;
    }
    if (!xiReady) {
      toast({ title: "Pick both playing XIs", variant: "destructive" });
      return;
    }

    // Persist toss → XI → start, surfacing the first failure.
    const tossRes = await tossMutation.mutateAsync({
      matchId,
      wonBy: tossWonBy!,
      decision: tossDecision!,
    });
    if (!tossRes.ok) {
      toast({ title: "Toss failed", description: tossRes.error, variant: "destructive" });
      return;
    }

    const xiRes = await xiMutation.mutateAsync({
      matchId,
      teamA: toMembers(xiA),
      teamB: toMembers(xiB),
    });
    if (!xiRes.ok) {
      toast({ title: "Playing XI failed", description: xiRes.error, variant: "destructive" });
      return;
    }

    const startRes = await startMutation.mutateAsync({ matchId });
    if (!startRes.ok) {
      toast({ title: "Could not start", description: startRes.error, variant: "destructive" });
      return;
    }

    toast({ title: "Match started" });
    router.push(`/match/${matchId}/score`);
  }

  const pending =
    tossMutation.isPending || xiMutation.isPending || startMutation.isPending;

  return (
    <div className="space-y-8">
      {/* Toss */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Toss
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {[teamA, teamB].map((side) => (
            <button
              key={side.teamId}
              type="button"
              aria-pressed={tossWonBy === side.teamId}
              onClick={() => setTossWonBy(side.teamId)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm transition-colors",
                tossWonBy === side.teamId
                  ? "border-primary bg-primary/10 font-medium"
                  : "border-border hover:bg-accent",
              )}
            >
              {side.name} won
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["bat", "bowl"] as TossDecision[]).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={tossDecision === d}
              onClick={() => setTossDecision(d)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm capitalize transition-colors",
                tossDecision === d
                  ? "border-primary bg-primary/10 font-medium"
                  : "border-border hover:bg-accent",
              )}
            >
              Elected to {d}
            </button>
          ))}
        </div>
      </section>

      {/* Playing XIs */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Playing XI
        </h2>
        <PlayingXISelector
          teamName={teamA.name}
          squad={teamA.squad}
          selected={xiA}
          onToggle={toggle(setXiA)}
        />
        <PlayingXISelector
          teamName={teamB.name}
          squad={teamB.squad}
          selected={xiB}
          onToggle={toggle(setXiB)}
        />
      </section>

      <Button
        onClick={handleStart}
        disabled={pending || !tossReady || !xiReady}
        className="w-full"
      >
        {pending ? "Starting…" : "Start match"}
      </Button>
    </div>
  );
}
