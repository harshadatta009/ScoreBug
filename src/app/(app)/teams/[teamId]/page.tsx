import * as React from "react";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/shared/AppHeader";
import { getUser } from "@/lib/auth/session";
import { asId } from "@/domain/shared/ids";
import {
  getTeam,
  getTeamMembers,
  listJoinRequests,
  getTeamStatistics,
  isTeamManager,
} from "@/lib/repositories/teamRepository";
import { TeamProfileClient } from "./TeamProfileClient";

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
}

export async function generateMetadata({ params }: TeamPageProps) {
  const { teamId } = await params;
  const team = await getTeam(asId<"TeamId">(teamId));
  return { title: team?.name ?? "Team" };
}

/**
 * Team profile page — public read.
 *
 * Fetches all data server-side so the page is fully pre-renderable.
 * The interactive parts (tabs, join request dialog, member controls) are
 * delegated to TeamProfileClient.
 *
 * Authorization for mutations is enforced in the server actions; here we
 * just pass down derived booleans so the client can show/hide UI affordances.
 */
export default async function TeamPage({ params }: TeamPageProps) {
  const { teamId } = await params;
  const tid = asId<"TeamId">(teamId);

  const [user, team] = await Promise.all([getUser(), getTeam(tid)]);

  if (!team) notFound();

  const currentUserId = user?.id ?? null;
  const uid = currentUserId ? asId<"UserId">(currentUserId) : null;

  // Parallel fetch — join requests only needed for managers.
  const [members, stats] = await Promise.all([
    getTeamMembers(tid),
    getTeamStatistics(tid),
  ]);

  // Determine manager / membership status.
  const isOwner = uid ? team.ownerId === uid : false;
  const managerViaRole =
    uid && !isOwner ? await isTeamManager(tid, uid) : false;
  const canManage = isOwner || managerViaRole;

  const joinRequests = canManage ? await listJoinRequests(tid) : [];

  const isMember =
    uid !== null &&
    members.some((m) => (m.userId as string) === (uid as string));

  return (
    <>
      <AppHeader title={team.name} backHref="/teams" />

      <div className="container mx-auto max-w-2xl pb-6">
        <TeamProfileClient
          team={team}
          members={members}
          joinRequests={joinRequests}
          stats={stats}
          currentUserId={currentUserId}
          isManager={canManage}
          isMember={isMember}
        />
      </div>
    </>
  );
}
