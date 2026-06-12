"use client";

import * as React from "react";
import { useTransition, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Edit, UserPlus, Loader2 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { requestToJoinAction } from "@/server/actions/team";
import type {
  Team,
  TeamMember,
  JoinRequest,
  TeamStatistics,
} from "@/lib/repositories/teamRepository";
import { teamKeys } from "@/features/teams/queries";
import { SquadList } from "@/features/teams/components/SquadList";
import { JoinRequestList } from "@/features/teams/components/JoinRequestList";
import { TeamStatsPanel } from "@/features/teams/components/TeamStatsPanel";

interface TeamProfileClientProps {
  team: Team;
  members: TeamMember[];
  joinRequests: JoinRequest[];
  stats: TeamStatistics | null;
  /** Authenticated user id, or null if signed out. */
  currentUserId: string | null;
  isManager: boolean;
  isMember: boolean;
}

/**
 * TeamProfileClient — client shell for the team detail page.
 *
 * Tabs: Squad | Stats | (Requests, for managers only).
 * Non-members see a "Request to join" button (sign-in gate handled server-side
 * by passing currentUserId=null, which hides the button).
 */
export function TeamProfileClient({
  team,
  members,
  joinRequests,
  stats,
  currentUserId,
  isManager,
  isMember,
}: TeamProfileClientProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinMessage, setJoinMessage] = useState("");

  const teamIdStr = team.id as string;

  // Refresh member/request data by invalidating the query cache.
  // The parent page (RSC) will re-render on next navigation; for in-session
  // refresh we also invalidate so any client queries pick up changes.
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: teamKeys.members(teamIdStr) });
    void queryClient.invalidateQueries({ queryKey: teamKeys.joinRequests(teamIdStr) });
  }

  function handleJoinRequest() {
    startTransition(async () => {
      const result = await requestToJoinAction({
        teamId: teamIdStr,
        message: joinMessage.trim() || null,
      });
      if (result.ok) {
        toast({ title: "Join request sent!" });
        setJoinOpen(false);
        setJoinMessage("");
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error,
        });
      }
    });
  }

  const pendingCount = joinRequests.length;

  return (
    <>
      {/* ── Banner + meta ───────────────────────────────────────── */}
      <div className="relative">
        {team.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={team.bannerUrl}
            alt={`${team.name} banner`}
            className="h-32 w-full object-cover sm:h-44"
          />
        ) : (
          <div className="h-32 w-full bg-gradient-to-br from-primary/20 to-primary/5 sm:h-44" />
        )}

        {/* Logo */}
        <div className="absolute -bottom-8 left-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-2 border-background bg-card shadow-md">
          {team.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={team.logoUrl}
              alt={`${team.name} logo`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-lg font-bold text-primary">
              {(team.shortName ?? team.name).slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* ── Name / location ─────────────────────────────────────── */}
      <div className="px-4 pb-4 pt-11">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold leading-tight">
              {team.name}
            </h2>
            {team.shortName && (
              <Badge variant="outline" className="mt-0.5 text-xs">
                {team.shortName}
              </Badge>
            )}
            {(team.city ?? team.country) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {[team.city, team.country].filter(Boolean).join(", ")}
              </p>
            )}
            {team.description && (
              <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                {team.description}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-2">
            {isManager && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/teams/${teamIdStr}/edit`}>
                  <Edit className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            )}
            {currentUserId && !isMember && (
              <Button
                size="sm"
                onClick={() => setJoinOpen(true)}
                disabled={isPending}
              >
                <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Join
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <Tabs defaultValue="squad" className="px-4">
        <TabsList className={isManager && pendingCount > 0 ? "grid w-full grid-cols-3" : "grid w-full grid-cols-2"}>
          <TabsTrigger value="squad">
            Squad ({members.length})
          </TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          {isManager && (
            <TabsTrigger value="requests">
              Requests{pendingCount > 0 ? ` (${pendingCount})` : ""}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="squad" className="mt-4">
          <SquadList
            members={members}
            teamId={teamIdStr}
            canManage={isManager}
            onRefresh={refresh}
          />
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          {stats ? (
            <TeamStatsPanel stats={stats} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No statistics recorded yet. Stats are computed after matches are
              completed.
            </p>
          )}
        </TabsContent>

        {isManager && (
          <TabsContent value="requests" className="mt-4">
            <JoinRequestList
              requests={joinRequests}
              teamId={teamIdStr}
              onRefresh={refresh}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* ── Join request dialog ─────────────────────────────────── */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request to join {team.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Optionally add a message for the team managers.
            </p>
            <textarea
              rows={3}
              value={joinMessage}
              onChange={(e) => setJoinMessage(e.target.value)}
              placeholder="Hi, I'd love to join your team…"
              maxLength={500}
              disabled={isPending}
              aria-label="Join request message"
              className="flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setJoinOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button onClick={handleJoinRequest} disabled={isPending}>
                {isPending && (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                Send request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
