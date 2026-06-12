import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/shared/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth/session";
import { getPlayer } from "@/lib/repositories/playerRepository";
import { asId } from "@/domain/shared/ids";
import { PlayerProfileForm } from "@/features/players/components/PlayerProfileForm";

interface Props {
  params: Promise<{ playerId: string }>;
}

export const metadata = { title: "Edit Player Profile" };

/**
 * Edit player profile page — auth-guarded and ownership-verified.
 *
 * Fetching the player server-side and checking ownership here means the form
 * only renders for the rightful owner; everyone else sees a 404 or login
 * redirect. The server action repeats this check as the authoritative gate.
 */
export default async function EditPlayerPage({ params }: Props) {
  const { playerId } = await params;

  const user = await getUser();
  if (!user) {
    redirect(`/login?redirectTo=/players/${playerId}/edit`);
  }

  const player = await getPlayer(asId<"PlayerId">(playerId));
  if (!player) notFound();

  // Only the owning user may edit.
  if (player.userId !== user.id) notFound();

  return (
    <>
      <AppHeader
        title="Edit Profile"
        backHref={`/players/${player.id}`}
      />

      <div className="container mx-auto max-w-lg px-4 py-6">
        <Card>
          <CardContent className="pt-6">
            <PlayerProfileForm player={player} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
