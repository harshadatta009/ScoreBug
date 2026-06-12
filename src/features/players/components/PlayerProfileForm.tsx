"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  createMyPlayerProfile,
  updateMyPlayerProfile,
} from "@/server/actions/player";
import type { Player } from "@/lib/repositories/playerRepository";

// ─── Schema (mirrors server-side schema) ─────────────────────────────────────

const battingStyleEnum = z.enum(["right_hand", "left_hand"]);
const bowlingStyleEnum = z.enum([
  "right_arm_fast",
  "right_arm_medium",
  "right_arm_offbreak",
  "right_arm_legbreak",
  "left_arm_fast",
  "left_arm_medium",
  "left_arm_orthodox",
  "left_arm_chinaman",
]);
const playerRoleEnum = z.enum([
  "batter",
  "bowler",
  "all_rounder",
  "wicket_keeper",
  "wk_batter",
]);
const dominantHandEnum = z.enum(["right", "left"]);

const formSchema = z.object({
  displayName: z.string().min(1, "Display name is required.").max(60),
  bio: z.string().max(500).optional(),
  dominantHand: dominantHandEnum.optional(),
  battingStyle: battingStyleEnum.optional(),
  bowlingStyle: bowlingStyleEnum.optional(),
  playerRole: playerRoleEnum.optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface PlayerProfileFormProps {
  /** When provided, the form is in edit mode pre-populated with this data. */
  player?: Player;
  /** Redirect after successful save. Defaults to the player's public profile. */
  redirectTo?: string;
}

const ROLE_OPTIONS: Array<{ value: FormValues["playerRole"]; label: string }> =
  [
    { value: "batter", label: "Batter" },
    { value: "bowler", label: "Bowler" },
    { value: "all_rounder", label: "All-rounder" },
    { value: "wicket_keeper", label: "Wicket-keeper" },
    { value: "wk_batter", label: "WK-Batter" },
  ];

const BATTING_OPTIONS: Array<{
  value: FormValues["battingStyle"];
  label: string;
}> = [
  { value: "right_hand", label: "Right-hand" },
  { value: "left_hand", label: "Left-hand" },
];

const BOWLING_OPTIONS: Array<{
  value: FormValues["bowlingStyle"];
  label: string;
}> = [
  { value: "right_arm_fast", label: "Right arm fast" },
  { value: "right_arm_medium", label: "Right arm medium" },
  { value: "right_arm_offbreak", label: "Right arm off-break" },
  { value: "right_arm_legbreak", label: "Right arm leg-break" },
  { value: "left_arm_fast", label: "Left arm fast" },
  { value: "left_arm_medium", label: "Left arm medium" },
  { value: "left_arm_orthodox", label: "Left arm orthodox" },
  { value: "left_arm_chinaman", label: "Left arm chinaman" },
];

const HAND_OPTIONS: Array<{
  value: FormValues["dominantHand"];
  label: string;
}> = [
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
];

/**
 * PlayerProfileForm — used for both creating and editing a player profile.
 * When `player` prop is provided the form pre-populates and calls the update
 * action; otherwise it calls the create action.
 */
export function PlayerProfileForm({
  player,
  redirectTo,
}: PlayerProfileFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: player
      ? {
          displayName: player.displayName,
          bio: player.bio ?? "",
          dominantHand: player.dominantHand ?? undefined,
          battingStyle: player.battingStyle ?? undefined,
          bowlingStyle: player.bowlingStyle ?? undefined,
          playerRole: player.playerRole ?? undefined,
        }
      : { displayName: "" },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = player
        ? await updateMyPlayerProfile(player.id, {
            displayName: values.displayName,
            bio: values.bio ?? null,
            dominantHand: values.dominantHand ?? null,
            battingStyle: values.battingStyle ?? null,
            bowlingStyle: values.bowlingStyle ?? null,
            playerRole: values.playerRole ?? null,
          })
        : await createMyPlayerProfile({
            displayName: values.displayName,
            bio: values.bio ?? null,
            dominantHand: values.dominantHand ?? null,
            battingStyle: values.battingStyle ?? null,
            bowlingStyle: values.bowlingStyle ?? null,
            playerRole: values.playerRole ?? null,
          });

      if (!result.ok) {
        toast({
          title: "Save failed",
          description: result.error ?? "Unknown error",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Profile saved!" });

      const destination =
        redirectTo ??
        (player
          ? `/players/${player.id}`
          : result.data
            ? `/players/${result.data.playerId}`
            : "/players");

      router.push(destination);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {/* Display name */}
      <div className="space-y-1.5">
        <Label htmlFor="displayName">Display name *</Label>
        <Input
          id="displayName"
          placeholder="Your name on Scorebug"
          {...register("displayName")}
          aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? "displayName-error" : undefined}
        />
        {errors.displayName && (
          <p id="displayName-error" className="text-xs text-destructive">
            {errors.displayName.message}
          </p>
        )}
      </div>

      {/* Bio */}
      <div className="space-y-1.5">
        <Label htmlFor="bio">Bio</Label>
        <textarea
          id="bio"
          rows={3}
          placeholder="A short bio…"
          className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          {...register("bio")}
          aria-invalid={!!errors.bio}
          aria-describedby={errors.bio ? "bio-error" : undefined}
        />
        {errors.bio && (
          <p id="bio-error" className="text-xs text-destructive">
            {errors.bio.message}
          </p>
        )}
      </div>

      {/* Player role */}
      <div className="space-y-1.5">
        <Label htmlFor="playerRole">Playing role</Label>
        <select
          id="playerRole"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          {...register("playerRole")}
        >
          <option value="">Select role…</option>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Dominant hand */}
      <div className="space-y-1.5">
        <Label htmlFor="dominantHand">Dominant hand</Label>
        <select
          id="dominantHand"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          {...register("dominantHand")}
        >
          <option value="">Select hand…</option>
          {HAND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Batting style */}
      <div className="space-y-1.5">
        <Label htmlFor="battingStyle">Batting style</Label>
        <select
          id="battingStyle"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          {...register("battingStyle")}
        >
          <option value="">Select style…</option>
          {BATTING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Bowling style */}
      <div className="space-y-1.5">
        <Label htmlFor="bowlingStyle">Bowling style</Label>
        <select
          id="bowlingStyle"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          {...register("bowlingStyle")}
        >
          <option value="">Select style…</option>
          {BOWLING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving…" : player ? "Save changes" : "Create profile"}
      </Button>
    </form>
  );
}
