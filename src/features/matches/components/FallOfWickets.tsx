import type { FallOfWicket } from "@/domain/cricket/scorecard";

/** Compact "fall of wickets" line, e.g. 1-12 (Player, 2.3 ov). */
export function FallOfWickets({
  fow,
  names,
}: {
  fow: FallOfWicket[];
  names: Map<string, string>;
}) {
  if (fow.length === 0) return null;

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Fall of wickets
      </h4>
      <p className="text-sm leading-relaxed">
        {fow.map((w, i) => (
          <span key={w.wicketNumber}>
            <span className="font-medium tabular-nums">
              {w.wicketNumber}-{w.score}
            </span>{" "}
            <span className="text-muted-foreground">
              ({names.get(w.playerOut) ?? "Player"}, {w.over} ov)
            </span>
            {i < fow.length - 1 ? "  •  " : ""}
          </span>
        ))}
      </p>
    </div>
  );
}
