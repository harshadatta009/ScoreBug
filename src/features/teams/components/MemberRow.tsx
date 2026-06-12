"use client";

import * as React from "react";
import { Trash2, ChevronDown } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { TeamMember } from "@/lib/repositories/teamRepository";
import type { TeamMemberRole } from "@/lib/supabase/database.types";

const ROLE_LABELS: Record<TeamMemberRole, string> = {
  owner: "Owner",
  captain: "Captain",
  vice_captain: "Vice Captain",
  manager: "Manager",
  player: "Player",
};

const ROLE_VARIANT: Record<
  TeamMemberRole,
  "default" | "secondary" | "outline" | "destructive"
> = {
  owner: "default",
  captain: "default",
  vice_captain: "secondary",
  manager: "secondary",
  player: "outline",
};

interface MemberRowProps {
  member: TeamMember;
  /** If true, shows role-change and remove controls. */
  canManage: boolean;
  onRemove: (memberId: string) => void;
  onRoleChange: (memberId: string, role: TeamMemberRole) => void;
  isPending?: boolean;
}

const ALL_ROLES: TeamMemberRole[] = [
  "captain",
  "vice_captain",
  "manager",
  "player",
];

/**
 * MemberRow — one row in the squad list.
 *
 * Shows avatar, name, jersey number, role badge. Managers see a role-change
 * popover and a remove button; owners cannot be removed (locked).
 */
export function MemberRow({
  member,
  canManage,
  onRemove,
  onRoleChange,
  isPending,
}: MemberRowProps) {
  const [roleOpen, setRoleOpen] = React.useState(false);
  const [removeOpen, setRemoveOpen] = React.useState(false);

  const displayLabel =
    member.displayName ?? member.fullName ?? `User ${member.userId.slice(0, 6)}`;
  const initials = displayLabel.slice(0, 2).toUpperCase();
  const isOwner = member.teamRole === "owner";

  return (
    <>
      <div className="flex items-center gap-3 py-2">
        <Avatar className="h-9 w-9 shrink-0">
          {member.avatarUrl && (
            <AvatarImage src={member.avatarUrl} alt={displayLabel} />
          )}
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayLabel}</p>
          <div className="flex items-center gap-1.5">
            <Badge variant={ROLE_VARIANT[member.teamRole]} className="text-xs">
              {ROLE_LABELS[member.teamRole]}
            </Badge>
            {member.jerseyNumber !== null && (
              <span className="text-xs text-muted-foreground">
                #{member.jerseyNumber}
              </span>
            )}
          </div>
        </div>

        {canManage && !isOwner && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              onClick={() => setRoleOpen(true)}
              disabled={isPending}
              aria-label={`Change role for ${displayLabel}`}
            >
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              onClick={() => setRemoveOpen(true)}
              disabled={isPending}
              aria-label={`Remove ${displayLabel} from team`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {/* Role change dialog */}
      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Change role — {displayLabel}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            {ALL_ROLES.map((role) => (
              <Button
                key={role}
                variant={member.teamRole === role ? "default" : "outline"}
                className="justify-start"
                onClick={() => {
                  onRoleChange(member.id, role);
                  setRoleOpen(false);
                }}
                disabled={isPending}
              >
                {ROLE_LABELS[role]}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation dialog */}
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Remove {displayLabel}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove them from the squad. They can rejoin by submitting
            a new request.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onRemove(member.id);
                setRemoveOpen(false);
              }}
              disabled={isPending}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
