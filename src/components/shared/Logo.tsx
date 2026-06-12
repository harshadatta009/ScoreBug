import Link from "next/link";
import { Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

interface LogoProps {
  /** Render as a link to this href. Omit for a non-interactive lockup. */
  href?: string;
  /** Hide the wordmark, show only the mark (useful in tight spaces). */
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const MARK_SIZE = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-12 w-12",
} as const;

const ICON_SIZE = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
} as const;

const TEXT_SIZE = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
} as const;

/** Scorebug brand lockup — the mark plus wordmark. */
export function Logo({ href, iconOnly, size = "md", className }: LogoProps) {
  const content = (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm",
          MARK_SIZE[size],
        )}
      >
        <Trophy className={ICON_SIZE[size]} aria-hidden="true" />
      </span>
      {!iconOnly && (
        <span className={cn("font-bold tracking-tight", TEXT_SIZE[size])}>
          Scorebug
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Scorebug home"
      >
        {content}
      </Link>
    );
  }
  return content;
}
