import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";

interface AppHeaderProps {
  title: string;
  /** If provided, renders a back button linking to this href. */
  backHref?: string;
  /** Slot for right-side actions (e.g. settings icon). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * AppHeader — sticky top header used by nested app pages.
 *
 * Kept as a Server Component (no interactivity required) so page layouts that
 * embed it stay RSC-friendly. Only add "use client" if you need hooks.
 *
 * Uses `safe-area-inset-top` padding for notched devices.
 */
export function AppHeader({
  title,
  backHref,
  actions,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-md supports-[padding-top:env(safe-area-inset-top)]:pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      {backHref && (
        <Link
          href={backHref}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
      )}

      <h1 className="flex-1 truncate text-base font-semibold leading-none">
        {title}
      </h1>

      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </header>
  );
}
