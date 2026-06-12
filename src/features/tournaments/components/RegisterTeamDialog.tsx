"use client";

import * as React from "react";
import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegisterTeam } from "@/features/tournaments/queries";

interface RegisterTeamDialogProps {
  tournamentId: string;
}

/**
 * RegisterTeamDialog — organizer-only control to add a team by its ID.
 *
 * In a full product this would be a team-search combobox; here we accept
 * a raw UUID for simplicity and keep the component self-contained.
 */
export function RegisterTeamDialog({ tournamentId }: RegisterTeamDialogProps) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const { mutate, isPending } = useRegisterTeam(tournamentId);

  function handleRegister() {
    setLocalError(null);
    const trimmedId = teamId.trim();
    if (!trimmedId) {
      setLocalError("Please enter a team ID.");
      return;
    }
    // Basic UUID format check.
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(trimmedId)) {
      setLocalError("Team ID must be a valid UUID.");
      return;
    }
    mutate(
      { teamId: trimmedId, groupName: groupName.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setTeamId("");
          setGroupName("");
        },
        onError: (e) => {
          setLocalError(e instanceof Error ? e.message : "Failed to register team.");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Add team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a team</DialogTitle>
          <DialogDescription>
            Enter the team&apos;s ID to add them to the tournament.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reg-team-id">Team ID (UUID)</Label>
            <Input
              id="reg-team-id"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-group">Group name (optional)</Label>
            <Input
              id="reg-group"
              placeholder="e.g. Group A"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>

          {localError && (
            <p role="alert" className="text-sm text-destructive">
              {localError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleRegister} disabled={isPending}>
            {isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
