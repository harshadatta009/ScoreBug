"use client";

import * as React from "react";
import { useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { respondToJoinRequestAction } from "@/server/actions/team";
import type { JoinRequest } from "@/lib/repositories/teamRepository";

interface JoinRequestListProps {
  requests: JoinRequest[];
  teamId: string;
  onRefresh: () => void;
}

/**
 * JoinRequestList — shows pending join requests with accept/decline controls.
 *
 * Only rendered for team owners/managers (the parent page gates visibility).
 */
export function JoinRequestList({
  requests,
  teamId,
  onRefresh,
}: JoinRequestListProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleRespond(requestId: string, accept: boolean) {
    startTransition(async () => {
      const result = await respondToJoinRequestAction(teamId, requestId, accept);
      if (result.ok) {
        toast({
          title: accept ? "Request accepted." : "Request declined.",
        });
        onRefresh();
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error,
        });
      }
    });
  }

  if (requests.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No pending join requests.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {requests.map((req) => {
        const label = req.displayName ?? `User ${req.userId.slice(0, 6)}`;
        const initials = label.slice(0, 2).toUpperCase();

        return (
          <div key={req.id} className="flex items-start gap-3 py-3">
            <Avatar className="mt-0.5 h-9 w-9 shrink-0">
              {req.avatarUrl && (
                <AvatarImage src={req.avatarUrl} alt={label} />
              )}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{label}</p>
              {req.message && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {req.message}
                </p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(req.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 px-2 text-xs text-green-600 hover:text-green-700"
                onClick={() => handleRespond(req.id, true)}
                disabled={isPending}
                aria-label={`Accept join request from ${label}`}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                onClick={() => handleRespond(req.id, false)}
                disabled={isPending}
                aria-label={`Decline join request from ${label}`}
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Decline
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function JoinRequestListSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}
