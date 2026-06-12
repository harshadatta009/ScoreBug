import { redirect } from "next/navigation";

import { AppHeader } from "@/components/shared/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth/session";
import { TournamentForm } from "@/features/tournaments/components/TournamentForm";

export const metadata = { title: "New Tournament" };

/**
 * Create tournament page.
 *
 * Auth-guarded: unauthenticated users are redirected to /login.
 * No global-role gate — any authenticated user can create a tournament.
 */
export default async function NewTournamentPage() {
  const user = await getUser();
  if (!user) redirect("/login?redirectTo=/tournaments/new");

  return (
    <>
      <AppHeader title="New Tournament" backHref="/tournaments" />

      <div className="container mx-auto max-w-lg px-4 py-6">
        <Card>
          <CardContent className="pt-6">
            <TournamentForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
