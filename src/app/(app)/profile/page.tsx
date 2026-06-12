import { LogOut } from "lucide-react";

import { AppHeader } from "@/components/shared/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getUser, getUserRoles } from "@/lib/auth/session";
import { signOut } from "@/server/actions/auth";

export const metadata = { title: "Profile" };

function initials(name: string | undefined, email: string | undefined) {
  const source = name?.trim() || email?.split("@")[0] || "?";
  return source
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Profile page. Behind the auth guard, so `getUser` is expected to return a
 * user. Shows the account identity, RBAC roles and sign-out.
 */
export default async function ProfilePage() {
  const [user, roles] = await Promise.all([getUser(), getUserRoles()]);

  const fullName = user?.user_metadata?.full_name as string | undefined;
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const email = user?.email ?? undefined;
  const displayRoles = roles.length ? roles : ["player"];

  return (
    <>
      <AppHeader title="Profile" />

      <div className="container mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Card>
          <CardContent className="flex items-center gap-4 py-6">
            <Avatar className="h-16 w-16">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
              <AvatarFallback className="text-lg">
                {initials(fullName, email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">
                {fullName ?? email ?? "Cricketer"}
              </p>
              {email && (
                <p className="truncate text-sm text-muted-foreground">
                  {email}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {displayRoles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium capitalize text-secondary-foreground"
                  >
                    {role.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 py-4 text-sm text-muted-foreground">
            <p>
              Profile editing (avatar, bio, batting &amp; bowling style) and
              career statistics are coming soon.
            </p>
          </CardContent>
        </Card>

        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </form>
      </div>
    </>
  );
}
