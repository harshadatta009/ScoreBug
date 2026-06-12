"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/shared/AppHeader";
import { useToast } from "@/components/ui/use-toast";
import { createTeamAction } from "@/server/actions/team";
import {
  TeamForm,
  type TeamFormValues,
} from "@/features/teams/components/TeamForm";

/**
 * Create team page.
 *
 * Auth guard: we cannot use a server-side redirect from a client component, so
 * we rely on the middleware protecting this route. If somehow an unauthenticated
 * user reaches here, the server action will throw UNAUTHENTICATED and we show
 * the error in a toast.
 *
 * The page is a Client Component because TeamForm needs hooks (react-hook-form).
 */
export default function NewTeamPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);

  async function handleSubmit(values: TeamFormValues) {
    setIsLoading(true);
    try {
      const result = await createTeamAction({
        name: values.name,
        shortName: values.shortName || null,
        city: values.city || null,
        country: values.country || null,
        description: values.description || null,
        logoUrl: values.logoUrl || null,
        bannerUrl: values.bannerUrl || null,
      });

      if (result.ok && result.data) {
        toast({ title: "Team created!" });
        router.push(`/teams/${result.data.teamId}`);
      } else {
        toast({
          variant: "destructive",
          title: "Error creating team",
          description: result.error,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <AppHeader title="Create team" backHref="/teams" />

      <div className="container mx-auto max-w-lg px-4 py-6">
        <TeamForm
          onSubmit={handleSubmit}
          submitLabel="Create team"
          isLoading={isLoading}
        />
      </div>
    </>
  );
}
