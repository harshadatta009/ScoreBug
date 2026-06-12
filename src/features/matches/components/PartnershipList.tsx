import type { Partnership } from "@/domain/cricket/scorecard";

/** Partnership breakdown for an innings (runs + balls per pair). */
export function PartnershipList({
  partnerships,
  names,
}: {
  partnerships: Partnership[];
  names: Map<string, string>;
}) {
  const meaningful = partnerships.filter((p) => p.balls > 0 || p.runs > 0);
  if (meaningful.length === 0) return null;

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Partnerships
      </h4>
      <ul className="space-y-1 text-sm">
        {meaningful.map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span className="truncate text-muted-foreground">
              {names.get(p.batters[0]) ?? "Player"} &amp;{" "}
              {names.get(p.batters[1]) ?? "Player"}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {p.runs} ({p.balls})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
