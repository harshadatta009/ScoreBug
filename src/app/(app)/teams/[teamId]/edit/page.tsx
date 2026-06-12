import * as React from "react";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/shared/AppHeader";
import { getUser } from "@/lib/auth/session";
import { asId } from "@/domain/shared/ids";
import {
  getTeam,
  isTeamManager,
} from "@/lib/repositories/teamRepository";
import { EditTeamClient } from "./EditTeamClient";

interface EditTeamPageProps {
  params: Promise<{ teamId: string }>;
}

export async function generateMetadata({ params }: EditTeamPageProps) {
  const { teamId } = await params;
  const team = await getTeam(asId<"TeamId">(teamId));
  return { title: team ? `Edit ${team.name}` : "Edit team" };
}

/**
 * Edit team page — guarded.
 *
 * Only the team owner or a manager can access this page. Unauthenticated users
 * are redirected to login; unauthorized users see a 404 (avoids leaking team
 * existence information to arbitrary sign-in prompts).
 */
export default async function EditTeamPage({ params }: EditTeamPageProps) {
  const { teamId } = await params;
  const tid = asId<"TeamId">(teamId);

  const user = await getUser();
  if (!user) {
    redirect(`/login?redirectTo=/teams/${teamId}/edit`);
  }

  const uid = asId<"UserId">(user.id);
  const team = await getTeam(tid);
  if (!team) notFound();

  const isOwner = team.ownerId === uid;
  const managerViaRole = !isOwner ? await isTeamManager(tid, uid) : false;

  if (!isOwner && !managerViaRole) {
    notFound();
  }

  return (
    <>
      <AppHeader title={`Edit ${team.name}`} backHref={`/teams/${teamId}`} />

      <div className="container mx-auto max-w-lg px-4 py-6">
        <EditTeamClient
          team={{
            id: teamId,
            name: team.name,
            shortName: team.shortName,
            city: team.city,
            country: team.country,
            description: team.description,
            logoUrl: team.logoUrl,
            bannerUrl: team.bannerUrl,
          }}
        />
      </div>
    </>
  );
}
