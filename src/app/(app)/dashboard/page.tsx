import Link from "next/link";
import {
  LogOut,
  PlayCircle,
  Users,
  Calendar,
  Trophy,
  User,
  BarChart3,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/shared/Logo";
import { getUser } from "@/lib/auth/session";
import { signOut } from "@/server/actions/auth";

export const metadata = { title: "Dashboard" };

const TILES = [
  { href: "/teams", icon: Users, title: "Teams", body: "Build your squad and invite players." },
  { href: "/matches", icon: Calendar, title: "Matches", body: "Set up and follow your games." },
  { href: "/tournaments", icon: Trophy, title: "Tournaments", body: "Run leagues, knockouts & points tables." },
  { href: "/players", icon: User, title: "Players", body: "Profiles, careers & achievements." },
  { href: "/stats", icon: BarChart3, title: "Leaderboards", body: "Top run-scorers, wicket-takers & MVPs." },
] as const;

function firstName(user: { user_metadata?: { full_name?: string } } | null) {
  const full = user?.user_metadata?.full_name?.trim();
  if (full) return full.split(" ")[0];
  return "there";
}

export default async function DashboardPage() {
  // Route is auth-guarded by middleware, so a user is expected here.
  const user = await getUser();

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-md">
        <Logo href="/dashboard" size="sm" />
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
          >
            <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </form>
      </header>

      <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Hi {firstName(user)} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Welcome to Scorebug. Here&apos;s how to get going.
          </p>
        </div>

        {/* Primary action — the fully working demo scorer */}
        <Link
          href="/match/demo/score"
          className="block rounded-xl bg-primary p-5 text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-3">
            <PlayCircle className="h-8 w-8 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">Open the live scorer</p>
              <p className="text-sm text-primary-foreground/80">
                Score a demo innings ball-by-ball and see the engine in action.
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
          </div>
        </Link>

        {/* Navigation tiles */}
        <div className="grid gap-3 sm:grid-cols-2">
          {TILES.map(({ href, icon: Icon, title, body }) => (
            <Link key={href} href={href} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/50">
                <CardContent className="flex items-start gap-3 p-4">
                  <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-muted-foreground">{body}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          The demo scorer above is fully playable today. Create teams, set up
          matches and run tournaments from the tiles above.
        </p>
      </div>
    </>
  );
}
