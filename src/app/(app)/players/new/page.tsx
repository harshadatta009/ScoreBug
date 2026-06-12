import { redirect } from "next/navigation";

import { AppHeader } from "@/components/shared/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth/session";
import { getPlayerByUserId } from "@/lib/repositories/playerRepository";
import { PlayerProfileForm } from "@/features/players/components/PlayerProfileForm";

export const metadata = { title: "Create Player Profile" };

/**
 * Create-profile page — auth-guarded.
 *
 * If the signed-in user already has a player row we redirect them straight to
 * their edit page rather than letting them create a duplicate.
 */
export default async function NewPlayerPage() {
  const user = await getUser();
  if (!user) {
    redirect("/login?redirectTo=/players/new");
  }

  // Redirect to the edit page if a profile already exists.
  const existing = await getPlayerByUserId(user.id);
  if (existing) {
    redirect(`/players/${existing.id}/edit`);
  }

  return (
    <>
      <AppHeader title="Create Player Profile" backHref="/players" />

      <div className="container mx-auto max-w-lg px-4 py-6">
        <Card>
          <CardContent className="pt-6">
            <PlayerProfileForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
