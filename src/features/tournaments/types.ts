/**
 * Tournament feature shared types.
 *
 * These types are the public shape of Tournament domain objects as seen by UI
 * components and client-side query hooks. They mirror the server repository
 * view models exactly but live here (not in the server-only repository) so
 * client components can import them without pulling in server-only code.
 */

import type { TournamentFormatEnum, MatchFormatEnum, MatchStatusEnum } from "@/lib/supabase/database.types";
import type { TournamentId, TeamId, UserId } from "@/domain/shared/ids";

export interface Tournament {
  id: TournamentId;
  name: string;
  format: TournamentFormatEnum;
  matchFormat: MatchFormatEnum;
  logoUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  organizerId: UserId;
  isPublic: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentTeam {
  id: string;
  tournamentId: TournamentId;
  teamId: TeamId;
  groupName: string | null;
  seed: number | null;
  joinedAt: string;
  team: {
    name: string;
    shortName: string | null;
    logoUrl: string | null;
  };
}

export interface Fixture {
  id: string;
  round: number | null;
  matchNumber: number | null;
  stage: string | null;
  groupName: string | null;
  teamAId: TeamId;
  teamBId: TeamId;
  teamAName: string;
  teamBName: string;
  status: MatchStatusEnum;
  scheduledAt: string | null;
  winnerTeamId: TeamId | null;
  resultSummary: string | null;
}
