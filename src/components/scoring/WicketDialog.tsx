"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DISMISSAL_TYPES, type DismissalType } from "@/domain/cricket/enums";

interface WicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Confirm the wicket with the selected dismissal type. */
  onConfirm: (type: DismissalType) => void;
}

const DISMISSAL_LABELS: Record<DismissalType, string> = {
  bowled: "Bowled",
  caught: "Caught",
  lbw: "LBW",
  run_out: "Run Out",
  stumped: "Stumped",
  hit_wicket: "Hit Wicket",
  retired_out: "Retired Out",
  retired_hurt: "Retired Hurt",
  obstructing_field: "Obstructing Field",
  hit_ball_twice: "Hit Ball Twice",
  timed_out: "Timed Out",
  handled_ball: "Handled Ball",
};

/**
 * WicketDialog — confirmation modal for recording a dismissal.
 *
 * Appears when the scorer taps the "W" button on the ScoringPad. The scorer
 * selects the dismissal type; additional attribution (fielders, bowler) is
 * handled by a follow-up form in a future iteration.
 */
export function WicketDialog({
  open,
  onOpenChange,
  onConfirm,
}: WicketDialogProps) {
  const [selected, setSelected] = React.useState<DismissalType | null>(null);

  // Reset selection each time the dialog opens
  React.useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  function handleConfirm() {
    if (!selected) return;
    onConfirm(selected);
    onOpenChange(false);
  }

  // Surface the 6 most common dismissals first, then the rare ones
  const common: DismissalType[] = [
    "bowled",
    "caught",
    "lbw",
    "run_out",
    "stumped",
    "hit_wicket",
  ];
  const rare = DISMISSAL_TYPES.filter((d) => !common.includes(d));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>How out?</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Common dismissals */}
          <div className="grid grid-cols-2 gap-2">
            {common.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelected(type)}
                className={cn(
                  "rounded-lg border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected === type
                    ? "border-wicket bg-wicket/10 text-wicket"
                    : "border-border hover:bg-accent hover:text-accent-foreground",
                )}
                aria-pressed={selected === type}
              >
                {DISMISSAL_LABELS[type]}
              </button>
            ))}
          </div>

          {/* Rare dismissals — collapsed list */}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Other dismissals…
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {rare.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelected(type)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected === type
                      ? "border-wicket bg-wicket/10 text-wicket"
                      : "border-border hover:bg-accent hover:text-accent-foreground",
                  )}
                  aria-pressed={selected === type}
                >
                  {DISMISSAL_LABELS[type]}
                </button>
              ))}
            </div>
          </details>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!selected}
            onClick={handleConfirm}
          >
            Confirm Wicket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
