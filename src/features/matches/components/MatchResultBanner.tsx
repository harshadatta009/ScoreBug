import { Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Result / status banner shown atop a match detail page. Falls back to a neutral
 * "in progress" / "scheduled" message when there is no completed result yet.
 */
export function MatchResultBanner({
  summary,
  winnerName,
  statusLabel,
}: {
  summary: string | null;
  winnerName: string | null;
  statusLabel: string;
}) {
  const hasResult = Boolean(summary);
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3",
        hasResult
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-muted/40",
      )}
    >
      {hasResult ? (
        <Trophy className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      ) : null}
      <div className="min-w-0">
        {hasResult ? (
          <p className="font-semibold">
            {winnerName ? `${winnerName} ` : ""}
            {summary}
          </p>
        ) : (
          <p className="font-medium text-muted-foreground">{statusLabel}</p>
        )}
      </div>
    </div>
  );
}
