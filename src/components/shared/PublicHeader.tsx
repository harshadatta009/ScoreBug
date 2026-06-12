import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/Logo";

/**
 * Public site header for the marketing pages (landing, auth).
 *
 * Deliberately separate from the authenticated app shell (which uses the
 * bottom nav) so signed-out visitors get a conventional top nav with clear
 * Log in / Sign up actions instead of app chrome.
 */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Logo href="/" size="sm" />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Sign up</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
