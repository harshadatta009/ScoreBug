"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui/use-toast";
import { updateTeamAction } from "@/server/actions/team";
import {
  TeamForm,
  type TeamFormValues,
} from "@/features/teams/components/TeamForm";

interface EditTeamClientProps {
  team: {
    id: string;
    name: string;
    shortName: string | null;
    city: string | null;
    country: string | null;
    description: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
  };
}

/**
 * EditTeamClient — client wrapper for the edit form.
 *
 * Receives pre-fetched team data as props (from the server page), calls the
 * updateTeam action and navigates back on success.
 */
export function EditTeamClient({ team }: EditTeamClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);

  async function handleSubmit(values: TeamFormValues) {
    setIsLoading(true);
    try {
      const result = await updateTeamAction(team.id, {
        name: values.name,
        shortName: values.shortName || null,
        city: values.city || null,
        country: values.country || null,
        description: values.description || null,
        logoUrl: values.logoUrl || null,
        bannerUrl: values.bannerUrl || null,
      });

      if (result.ok) {
        toast({ title: "Team updated." });
        router.push(`/teams/${team.id}`);
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Error updating team",
          description: result.error,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <TeamForm
      defaultValues={{
        name: team.name,
        shortName: team.shortName ?? "",
        city: team.city ?? "",
        country: team.country ?? "",
        description: team.description ?? "",
        logoUrl: team.logoUrl ?? "",
        bannerUrl: team.bannerUrl ?? "",
      }}
      onSubmit={handleSubmit}
      submitLabel="Save changes"
      isLoading={isLoading}
    />
  );
}
