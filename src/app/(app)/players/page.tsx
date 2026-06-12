import { Plus } from "lucide-react";
import Link from "next/link";

import { AppHeader } from "@/components/shared/AppHeader";
import { Button } from "@/components/ui/button";
import { PlayersList } from "@/features/players/components/PlayersList";

export const metadata = { title: "Players" };

/**
 * Players directory page — public read.
 *
 * The searchable list is a client component (PlayersList) so filtering is
 * interactive without a full page reload. The header action links to the
 * create-profile flow.
 */
export default function PlayersPage() {
  return (
    <>
      <AppHeader
        title="Players"
        actions={
          <Button size="sm" asChild>
            <Link href="/players/new">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              My Profile
            </Link>
          </Button>
        }
      />

      <div className="container mx-auto max-w-2xl px-4 py-6">
        <PlayersList />
      </div>
    </>
  );
}
