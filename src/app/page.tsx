import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  CloudOff,
  Radio,
  Trophy,
  BarChart3,
  Users,
  ArrowRight,
  PlayCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/shared/PublicHeader";
import { Logo } from "@/components/shared/Logo";
import { getUser } from "@/lib/auth/session";

const FEATURES = [
  {
    icon: Activity,
    title: "Ball-by-ball scoring",
    body: "Score every delivery — runs, wides, no-balls, byes, wickets, free hits and super overs — with automatic strike rotation and over tracking.",
  },
  {
    icon: Radio,
    title: "Live & real-time",
    body: "Fans follow the match as it happens: live scorecard, run rate, required run rate and an over-by-over commentary feed.",
  },
  {
    icon: CloudOff,
    title: "Works offline",
    body: "Lost signal at the ground? Keep scoring. Every ball is saved on-device and synced automatically when you're back online.",
  },
  {
    icon: Trophy,
    title: "Tournaments",
    body: "Run leagues, knockouts and round-robins with fixtures, points tables, net run rate and playoffs handled for you.",
  },
  {
    icon: BarChart3,
    title: "Stats that build themselves",
    body: "Batting, bowling and fielding stats, player rankings and leaderboards — all generated from the ball-by-ball record.",
  },
  {
    icon: Users,
    title: "Teams & players",
    body: "Manage squads, invite players, track careers and follow your favourite teams and tournaments.",
  },
] as const;

const STEPS = [
  {
    n: "1",
    title: "Create your team",
    body: "Add your squad and invite players in a couple of taps.",
  },
  {
    n: "2",
    title: "Set up a match",
    body: "Pick teams, venue and the toss, then choose your playing XI.",
  },
  {
    n: "3",
    title: "Score it live",
    body: "Tap through the over. The scorecard and stats update instantly.",
  },
] as const;

export default async function HomePage() {
  // Signed-in visitors don't need the marketing page — send them to the app.
  const user = await getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-primary/10 via-background to-background">
          <div className="container mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Free • Installable • Works offline
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
              Score cricket like the pros — from your phone.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Scorebug is a live cricket scoring and tournament platform for
              clubs, leagues and weekend games. Ball-by-ball scoring, real-time
              scorecards and automatic stats — even with no signal.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/signup">
                  Get started free
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Link href="/match/demo/score">
                  <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                  Try the live demo
                </Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              No account needed for the demo scorer.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="container mx-auto max-w-4xl px-4 py-14">
          <h2 className="text-center text-2xl font-semibold">
            From squad to scorecard in three steps
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                  {s.n}
                </div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border/60 bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-center text-2xl font-semibold">
              Everything you need to run the game
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-3 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="container mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-2xl font-semibold">Ready for your next match?</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Create a free account and score your first game today.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/signup">
              Create your free account
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="container mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <Logo href="/" size="sm" />
          <p>© {2026} Scorebug. Built for the love of the game.</p>
        </div>
      </footer>
    </div>
  );
}
