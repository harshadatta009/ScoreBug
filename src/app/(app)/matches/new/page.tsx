import { redirect } from "next/navigation";

import { AppHeader } from "@/components/shared/AppHeader";
import { getUser } from "@/lib/auth/session";

import { CreateMatchForm } from "@/features/matches/components/CreateMatchForm";
import { listTeamOptions } from "@/features/matches/data";

export const metadata = { title: "New match" };
export const dynamic = "force-dynamic";

export default async function NewMatchPage() {
  const user = await getUser();
  if (!user) redirect("/login?redirectTo=/matches/new");

  const teams = await listTeamOptions();

  return (
    <>
      <AppHeader title="New match" backHref="/matches" />
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <CreateMatchForm teams={teams} />
      </div>
    </>
  );
}
