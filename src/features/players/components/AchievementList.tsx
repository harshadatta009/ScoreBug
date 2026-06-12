import { Trophy } from "lucide-react";

import type { PlayerAchievement } from "@/lib/repositories/playerRepository";

interface AchievementListProps {
  achievements: PlayerAchievement[];
}

/** Format an ISO date string to a locale-friendly short date. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * AchievementList — chronological timeline of player achievements.
 * Renders a timeline dot + card for each entry, or a clean empty state.
 *
 * Achievements are sorted newest-first by the repository, so the first entry
 * is the most recent milestone.
 */
export function AchievementList({ achievements }: AchievementListProps) {
  if (achievements.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Trophy className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <p className="text-sm text-muted-foreground">
          No achievements yet — keep playing!
        </p>
      </div>
    );
  }

  return (
    <ol className="relative border-l border-border pl-4" aria-label="Achievements timeline">
      {achievements.map((achievement) => (
        <li key={achievement.id} className="mb-6 last:mb-0">
          {/* Timeline dot */}
          <span
            aria-hidden="true"
            className="absolute -left-[5px] flex h-3 w-3 items-center justify-center rounded-full border border-background bg-primary"
          />

          <time
            dateTime={achievement.awardedAt}
            className="mb-1 block text-xs text-muted-foreground"
          >
            {formatDate(achievement.awardedAt)}
          </time>

          <p className="font-semibold leading-snug">{achievement.title}</p>

          {achievement.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {achievement.description}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
