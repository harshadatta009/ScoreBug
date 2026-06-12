"use client";

/**
 * Live Scoring Screen — /match/[matchId]/score
 *
 * The primary work surface for a scorer in the field. Full-screen (outside the
 * (app) BottomNav shell) so the scoring pad gets maximum room.
 *
 * Data wiring:
 *  - On mount we fetch the real scoring context via the `getLiveScoringContext`
 *    server action: the current open innings, match rules, the persisted ball
 *    log, and a seed opening pair derived from the playing XIs.
 *  - The Zustand store is initialized from that real config + existing balls, so
 *    the engine replays history and the screen resumes mid-innings correctly.
 *  - Each delivery is applied optimistically (instant UI via the engine) and
 *    persisted through the `recordBall` server action; on success we reconcile
 *    the local log with the authoritative server sequence.
 *  - If there is no real live innings (e.g. matchId === "demo"), we fall back to
 *    the original demo innings so the pad stays explorable.
 */

import * as React from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiveScoreHeader } from "@/components/scoring/LiveScoreHeader";
import {
  ScoringPad,
  type OnScorePayload,
  type OnExtraPayload,
  type OnWicketPayload,
} from "@/components/scoring/ScoringPad";
import { WicketDialog } from "@/components/scoring/WicketDialog";
import { useScoringStore } from "@/stores/scoringStore";
import { asId } from "@/domain/shared/ids";
import type { MatchId, InningsId, TeamId, PlayerId } from "@/domain/shared/ids";
import type { DismissalType } from "@/domain/cricket/enums";
import type { RecordBallInput } from "@/domain/cricket/ball";
import { DEFAULT_T20_RULES } from "@/domain/cricket/match";
import { useToast } from "@/components/ui/use-toast";
import {
  getLiveScoringContext,
  recordBall as recordBallAction,
} from "@/server/actions/match";
import { matchKeys } from "@/features/matches/queries";

// ---------------------------------------------------------------------------
// Demo / fallback data, used when no real live innings exists.
// ---------------------------------------------------------------------------

const DEMO_STRIKER_ID = asId<"PlayerId">("player-striker-1") as PlayerId;
const DEMO_NON_STRIKER_ID = asId<"PlayerId">("player-nonstriker-1") as PlayerId;
const DEMO_BOWLER_ID = asId<"PlayerId">("player-bowler-1") as PlayerId;
const DEMO_BATTING_TEAM = asId<"TeamId">("team-batting-1") as TeamId;
const DEMO_BOWLING_TEAM = asId<"TeamId">("team-bowling-1") as TeamId;
const DEMO_INNINGS_ID = asId<"InningsId">("innings-demo-1") as InningsId;

function buildBallInput(
  strikerId: PlayerId,
  nonStrikerId: PlayerId,
  bowlerId: PlayerId,
  inningsId: InningsId,
  isFreeHit: boolean,
  partial: Omit<
    RecordBallInput,
    "inningsId" | "striker" | "nonStriker" | "bowler" | "recordedBy" | "isFreeHit"
  >,
): RecordBallInput {
  return {
    inningsId,
    striker: strikerId,
    nonStriker: nonStrikerId,
    bowler: bowlerId,
    recordedBy: null,
    isFreeHit,
    ...partial,
  };
}

export default function LiveScoringPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId as MatchId;
  const isDemo = matchId === ("demo" as MatchId);
  const { toast } = useToast();

  const { init, recordBall, reconcile, rollback, balls, score, pendingSequences } =
    useScoringStore();

  // ---------------------------------------------------------------------------
  // Fetch real scoring context (skipped for the demo route).
  // ---------------------------------------------------------------------------
  const contextQuery = useQuery({
    queryKey: [...matchKeys.detail(matchId), "scoring"],
    queryFn: () => getLiveScoringContext({ matchId }),
    enabled: !isDemo,
    staleTime: 0,
  });

  const ctx = contextQuery.data?.ok ? contextQuery.data.data : null;

  // Seed crease pair from the live context, falling back to demo ids.
  const seedStriker =
    (ctx?.seed.strikerId ? asId<"PlayerId">(ctx.seed.strikerId) : null) ??
    DEMO_STRIKER_ID;
  const seedNonStriker =
    (ctx?.seed.nonStrikerId ? asId<"PlayerId">(ctx.seed.nonStrikerId) : null) ??
    DEMO_NON_STRIKER_ID;
  const seedBowler =
    (ctx?.seed.bowlerId ? asId<"PlayerId">(ctx.seed.bowlerId) : null) ??
    DEMO_BOWLER_ID;

  const inningsId = ctx?.innings.id ?? DEMO_INNINGS_ID;

  // Wicket dialog state
  const [wicketDialogOpen, setWicketDialogOpen] = React.useState(false);
  const pendingWicketRuns = React.useRef<number>(0);

  // ---------------------------------------------------------------------------
  // Initialise the innings once data is ready (or immediately in demo mode).
  // ---------------------------------------------------------------------------
  const noLiveInnings = contextQuery.data?.ok === false;
  React.useEffect(() => {
    if (isDemo || contextQuery.isError || noLiveInnings) {
      // Demo / no-live-innings fallback.
      init(
        {
          id: DEMO_INNINGS_ID,
          matchId,
          inningsNumber: 1,
          battingTeam: DEMO_BATTING_TEAM,
          bowlingTeam: DEMO_BOWLING_TEAM,
          isSuperOver: false,
          target: null,
        },
        DEFAULT_T20_RULES,
      );
      return;
    }
    if (ctx) {
      // Real innings: replay the persisted ball log through the engine.
      init(ctx.innings, ctx.rules, ctx.balls);
    }
  }, [isDemo, ctx, contextQuery.isError, noLiveInnings, init, matchId]);

  // ---------------------------------------------------------------------------
  // Derive crease pair from live score; fall back to the seed pair.
  // ---------------------------------------------------------------------------
  const strikerId = score?.strikerId ?? seedStriker;
  const nonStrikerId = score?.nonStrikerId ?? seedNonStriker;
  const bowlerId = score?.currentBowlerId ?? seedBowler;
  const isFreeHit = score?.isFreeHitNext ?? false;

  // ── Editable player names ────────────────────────────────────────────────
  // A scorer can rename the two batters and the bowler. Names are keyed by
  // player id and persisted to localStorage per match so they survive reloads.
  const namesKey = `scorebug:names:${matchId}`;
  const [customNames, setCustomNames] = React.useState<Record<string, string>>({});
  const [namesOpen, setNamesOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(namesKey);
      if (raw) setCustomNames(JSON.parse(raw) as Record<string, string>);
    } catch {
      /* ignore malformed storage */
    }
  }, [namesKey]);

  const saveNames = React.useCallback(
    (next: Record<string, string>) => {
      setCustomNames(next);
      try {
        window.localStorage.setItem(namesKey, JSON.stringify(next));
      } catch {
        /* storage may be unavailable (private mode) — keep in-memory */
      }
    },
    [namesKey],
  );

  // Resolve a player id to a display name: a custom name wins; otherwise demo
  // defaults (matched by id role), then a short fallback for real matches.
  const nameOf = React.useCallback(
    (id: string): string => {
      if (customNames[id]) return customNames[id]!;
      if (isDemo) {
        if (id.includes("nonstriker")) return "Batter 2";
        if (id.includes("striker")) return "Batter 1";
        if (id.includes("bowler")) return "Bowler";
      }
      return `Player ${id.slice(-4)}`;
    },
    [customNames, isDemo],
  );

  // Draft state for the edit-names dialog (captured when opened).
  const [namesDraft, setNamesDraft] = React.useState({
    striker: "",
    nonStriker: "",
    bowler: "",
  });

  function openNames() {
    setNamesDraft({
      striker: nameOf(strikerId),
      nonStriker: nameOf(nonStrikerId),
      bowler: nameOf(bowlerId),
    });
    setNamesOpen(true);
  }

  function commitNames() {
    saveNames({
      ...customNames,
      [strikerId]: namesDraft.striker.trim() || nameOf(strikerId),
      [nonStrikerId]: namesDraft.nonStriker.trim() || nameOf(nonStrikerId),
      [bowlerId]: namesDraft.bowler.trim() || nameOf(bowlerId),
    });
    setNamesOpen(false);
  }

  // ---------------------------------------------------------------------------
  // Persist a delivery: optimistic local apply, then server action + reconcile.
  // ---------------------------------------------------------------------------
  const persist = React.useCallback(
    async (input: RecordBallInput) => {
      const optimistic = recordBall(input);

      // Demo route never hits the server.
      if (isDemo || !ctx) return;

      const res = await recordBallAction({
        matchId,
        inningsId: input.inningsId,
        striker: input.striker,
        nonStriker: input.nonStriker,
        bowler: input.bowler,
        batRuns: input.batRuns,
        extraType: input.extraType,
        extraRuns: input.extraRuns,
        wicket: input.wicket
          ? {
              type: input.wicket.type,
              playerOut: input.wicket.playerOut,
              bowler: input.wicket.bowler,
              fielders: input.wicket.fielders,
            }
          : null,
        isFreeHit: input.isFreeHit,
        commentary: input.commentary ?? null,
      });

      if (!res.ok) {
        // Roll back the optimistic ball so the engine state matches the server.
        rollback(optimistic.sequence);
        toast({
          title: "Ball not saved",
          description: res.error,
          variant: "destructive",
        });
        return;
      }

      // Re-read the authoritative log so over/ballInOver + sequence are exact.
      const fresh = await getLiveScoringContext({ matchId });
      if (fresh.ok && fresh.data) reconcile(fresh.data.balls);
    },
    [recordBall, isDemo, ctx, matchId, rollback, reconcile, toast],
  );

  // ---------------------------------------------------------------------------
  // Undo: rollback the last ball if still pending locally.
  // ---------------------------------------------------------------------------
  const lastBall = balls.at(-1) ?? null;
  const canUndo = lastBall !== null && pendingSequences.has(lastBall.sequence);

  function handleUndo() {
    if (!canUndo || lastBall === null) return;
    rollback(lastBall.sequence);
  }

  // ---------------------------------------------------------------------------
  // ScoringPad callbacks
  // ---------------------------------------------------------------------------
  function handleScore({ batRuns }: OnScorePayload) {
    void persist(
      buildBallInput(strikerId, nonStrikerId, bowlerId, inningsId, isFreeHit, {
        batRuns,
        extraType: null,
        extraRuns: 0,
        wicket: null,
      }),
    );
  }

  function handleExtra({ extraType, extraRuns, batRuns }: OnExtraPayload) {
    void persist(
      buildBallInput(strikerId, nonStrikerId, bowlerId, inningsId, isFreeHit, {
        batRuns,
        extraType,
        extraRuns,
        wicket: null,
      }),
    );
  }

  function handleWicketIntent({ batRuns }: OnWicketPayload) {
    pendingWicketRuns.current = batRuns;
    setWicketDialogOpen(true);
  }

  function handleWicketConfirm(dismissalType: DismissalType) {
    void persist(
      buildBallInput(strikerId, nonStrikerId, bowlerId, inningsId, isFreeHit, {
        batRuns: 0,
        extraType: null,
        extraRuns: 0,
        wicket: {
          type: dismissalType,
          playerOut: strikerId,
          bowler:
            dismissalType === "run_out" ||
            dismissalType === "retired_out" ||
            dismissalType === "retired_hurt" ||
            dismissalType === "obstructing_field" ||
            dismissalType === "timed_out" ||
            dismissalType === "handled_ball"
              ? null
              : bowlerId,
          fielders: [],
        },
      }),
    );
    pendingWicketRuns.current = 0;
  }

  const loading = !isDemo && contextQuery.isLoading;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <LiveScoreHeader
        score={score}
        balls={balls}
        battingTeamName={isDemo ? "Demo XI" : "Batting XI"}
        resolveName={nameOf}
        backHref={isDemo ? "/" : `/matches/${matchId}`}
        isLive
        onEditNames={openNames}
      />

      <Tabs defaultValue="scoring" className="flex flex-1 flex-col">
        <TabsList className="mt-3 grid grid-cols-2 self-center">
          <TabsTrigger value="scoring" className="px-8">
            Score
          </TabsTrigger>
          <TabsTrigger value="scorecard" className="px-8">
            Scorecard
          </TabsTrigger>
        </TabsList>

        {/* SCORE tab — center hint, scoring pad pinned to the bottom */}
        <TabsContent
          value="scoring"
          className="flex flex-1 flex-col focus-visible:outline-none"
        >
          <div className="flex flex-1 items-center justify-center px-6 py-6 text-center">
            {loading ? (
              <Skeleton className="h-4 w-40" />
            ) : (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {nameOf(bowlerId)}
                </span>{" "}
                to{" "}
                <span className="font-medium text-foreground">
                  {nameOf(strikerId)}
                </span>
                <br />
                Record the delivery below.
              </p>
            )}
          </div>

          <ScoringPad
            onScore={handleScore}
            onExtra={handleExtra}
            onWicket={handleWicketIntent}
            onUndo={handleUndo}
            canUndo={canUndo}
            isFreeHit={score?.isFreeHitNext ?? false}
          />
        </TabsContent>

        {/* SCORECARD tab */}
        <TabsContent
          value="scorecard"
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4 focus-visible:outline-none"
        >
          {score ? (
            <>
              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Batting
                </h3>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Batter</th>
                        <th className="px-2 py-1.5 text-right font-medium">R</th>
                        <th className="px-2 py-1.5 text-right font-medium">B</th>
                        <th className="px-2 py-1.5 text-right font-medium">4s</th>
                        <th className="px-2 py-1.5 text-right font-medium">6s</th>
                        <th className="px-3 py-1.5 text-right font-medium">SR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {score.battingCards.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-3 text-center text-xs text-muted-foreground">
                            No deliveries yet.
                          </td>
                        </tr>
                      ) : (
                        score.battingCards.map((c) => (
                          <tr key={c.player} className="tabular-nums">
                            <td className="px-3 py-1.5 text-left">
                              {nameOf(c.player)}
                              {!c.isOut && (
                                <span className="ml-1 text-xs text-four">not out</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right font-semibold">{c.runs}</td>
                            <td className="px-2 py-1.5 text-right">{c.ballsFaced}</td>
                            <td className="px-2 py-1.5 text-right">{c.fours}</td>
                            <td className="px-2 py-1.5 text-right">{c.sixes}</td>
                            <td className="px-3 py-1.5 text-right">{c.strikeRate.toFixed(1)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Extras {score.extras.total} (wd {score.extras.wides}, nb{" "}
                  {score.extras.noBalls}, b {score.extras.byes}, lb {score.extras.legByes})
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Bowling
                </h3>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Bowler</th>
                        <th className="px-2 py-1.5 text-right font-medium">O</th>
                        <th className="px-2 py-1.5 text-right font-medium">M</th>
                        <th className="px-2 py-1.5 text-right font-medium">R</th>
                        <th className="px-2 py-1.5 text-right font-medium">W</th>
                        <th className="px-3 py-1.5 text-right font-medium">Econ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {score.bowlingCards.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-3 text-center text-xs text-muted-foreground">
                            No deliveries yet.
                          </td>
                        </tr>
                      ) : (
                        score.bowlingCards.map((c) => (
                          <tr key={c.player} className="tabular-nums">
                            <td className="px-3 py-1.5 text-left">{nameOf(c.player)}</td>
                            <td className="px-2 py-1.5 text-right">{c.oversText}</td>
                            <td className="px-2 py-1.5 text-right">{c.maidens}</td>
                            <td className="px-2 py-1.5 text-right">{c.runsConceded}</td>
                            <td className="px-2 py-1.5 text-right font-semibold">{c.wickets}</td>
                            <td className="px-3 py-1.5 text-right">{c.economy.toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <p className="text-center text-xs text-muted-foreground">
                {balls.length} deliveries recorded
                {pendingSequences.size > 0 ? ` · ${pendingSequences.size} syncing` : ""}
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <WicketDialog
        open={wicketDialogOpen}
        onOpenChange={setWicketDialogOpen}
        onConfirm={handleWicketConfirm}
      />

      <Dialog open={namesOpen} onOpenChange={setNamesOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit names</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name-striker">Batter on strike</Label>
              <Input
                id="name-striker"
                value={namesDraft.striker}
                onChange={(e) =>
                  setNamesDraft((d) => ({ ...d, striker: e.target.value }))
                }
                placeholder="e.g. Rohit Sharma"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name-nonstriker">Non-striker</Label>
              <Input
                id="name-nonstriker"
                value={namesDraft.nonStriker}
                onChange={(e) =>
                  setNamesDraft((d) => ({ ...d, nonStriker: e.target.value }))
                }
                placeholder="e.g. Virat Kohli"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name-bowler">Bowler</Label>
              <Input
                id="name-bowler"
                value={namesDraft.bowler}
                onChange={(e) =>
                  setNamesDraft((d) => ({ ...d, bowler: e.target.value }))
                }
                placeholder="e.g. Jasprit Bumrah"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNamesOpen(false)}>
              Cancel
            </Button>
            <Button onClick={commitNames}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
