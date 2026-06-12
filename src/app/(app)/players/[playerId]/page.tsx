import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";

import { AppHeader } from "@/components/shared/AppHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUser } from "@/lib/auth/session";
import {
  getPlayer,
  getPlayerAchievements,
  getPlayerStatistics,
} from "@/lib/repositories/playerRepository";
import { asId } from "@/domain/shared/ids";
import { CareerStats } from "@/features/players/components/CareerStats";
import { AchievementList } from "@/features/players/components/AchievementList";

interface Props {
  params: Promise<{ playerId: string }>;
}

/** Human-readable labels for enum values shown in the profile header. */
const ROLE_LABELS: Record<string, string> = {
  batter: "Batter",
  bowler: "Bowler",
  all_rounder: "All-rounder",
  wicket_keeper: "Wicket-keeper",
  wk_batter: "WK-Batter",
};

const BATTING_LABELS: Record<string, string> = {
  right_hand: "RHB",
  left_hand: "LHB",
};

const BOWLING_LABELS: Record<string, string> = {
  right_arm_fast: "RAF",
  right_arm_medium: "RAM",
  right_arm_offbreak: "ROB",
  right_arm_legbreak: "RLB",
  left_arm_fast: "LAF",
  left_arm_medium: "LAM",
  left_arm_orthodox: "LAO",
  left_arm_chinaman: "CHI",
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export async function generateMetadata({ params }: Props) {
  const { playerId } = await params;
  const player = await getPlayer(asId<"PlayerId">(playerId));
  return { title: player ? `${player.displayName} — Players` : "Player" };
}

/**
 * Public player profile page — CricHeroes-style.
 *
 * Loads player, statistics and achievements in parallel. No auth requirement;
 * the edit button is only shown to the owning user.
 */
export default async function PlayerProfilePage({ params }: Props) {
  const { playerId } = await params;
  const brandedId = asId<"PlayerId">(playerId);

  const [player, stats, achievements, user] = await Promise.all([
    getPlayer(brandedId),
    getPlayerStatistics(brandedId),
    getPlayerAchievements(brandedId),
    getUser(),
  ]);

  if (!player) notFound();

  const isOwner = user?.id != null && player.userId === user.id;

  return (
    <>
      <AppHeader
        title={player.displayName}
        backHref="/players"
        actions={
          isOwner ? (
            <Button size="sm" variant="outline" asChild>
              <Link
                href={`/players/${player.id}/edit`}
                aria-label="Edit your player profile"
              >
                <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Edit
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Profile header */}
        <Card>
          <CardContent className="flex items-start gap-5 pt-6">
            <Avatar className="h-20 w-20 shrink-0">
              {player.photoUrl && (
                <AvatarImage src={player.photoUrl} alt={player.displayName} />
              )}
              <AvatarFallback className="text-2xl">
                {initials(player.displayName)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 space-y-2">
              <h2 className="text-xl font-bold leading-tight">
                {player.displayName}
              </h2>

              {/* Role & style badges */}
              <div className="flex flex-wrap gap-1.5">
                {player.playerRole && (
                  <Badge variant="default">
                    {ROLE_LABELS[player.playerRole] ?? player.playerRole}
                  </Badge>
                )}
                {player.battingStyle && (
                  <Badge variant="secondary">
                    {BATTING_LABELS[player.battingStyle] ?? player.battingStyle}
                  </Badge>
                )}
                {player.bowlingStyle && (
                  <Badge variant="secondary">
                    {BOWLING_LABELS[player.bowlingStyle] ?? player.bowlingStyle}
                  </Badge>
                )}
                {player.dominantHand && (
                  <Badge variant="outline" className="capitalize">
                    {player.dominantHand}-handed
                  </Badge>
                )}
              </div>

              {player.bio && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {player.bio}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats & achievements tabs */}
        <Tabs defaultValue="stats">
          <TabsList className="w-full">
            <TabsTrigger value="stats" className="flex-1">
              Career Stats
            </TabsTrigger>
            <TabsTrigger value="achievements" className="flex-1">
              Achievements
              {achievements.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {achievements.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="mt-4">
            <CareerStats stats={stats} />
          </TabsContent>

          <TabsContent value="achievements" className="mt-4">
            <AchievementList achievements={achievements} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
