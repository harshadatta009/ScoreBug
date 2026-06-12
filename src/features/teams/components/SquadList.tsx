"use client";

import * as React from "react";
import { useTransition } from "react";
import { UserPlus } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  removeMemberAction,
  setMemberRoleAction,
} from "@/server/actions/team";
import type { TeamMember } from "@/lib/repositories/teamRepository";
import type { TeamMemberRole } from "@/lib/supabase/database.types";
import { MemberRow } from "./MemberRow";

interface SquadListProps {
  members: TeamMember[];
  teamId: string;
  /** Whether the current viewer is an owner/manager and may mutate the squad. */
  canManage: boolean;
  /** Re-fetch data after a mutation. */
  onRefresh: () => void;
}

/**
 * SquadList — renders all accepted squad members, with optional management
 * controls (role change, remove) for owners and managers.
 */
export function SquadList({
  members,
  teamId,
  canManage,
  onRefresh,
}: SquadListProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleRemove(memberId: string) {
    startTransition(async () => {
      const result = await removeMemberAction(teamId, memberId);
      if (result.ok) {
        toast({ title: "Member removed." });
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

  function handleRoleChange(memberId: string, role: TeamMemberRole) {
    startTransition(async () => {
      const result = await setMemberRoleAction(teamId, memberId, role);
      if (result.ok) {
        toast({ title: "Role updated." });
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

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <UserPlus
          className="h-10 w-10 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">
          No squad members yet. Players can request to join below.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {members.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          canManage={canManage}
          isPending={isPending}
          onRemove={handleRemove}
          onRoleChange={handleRoleChange}
        />
      ))}
    </div>
  );
}

/** Skeleton placeholder while members are loading. */
export function SquadListSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
