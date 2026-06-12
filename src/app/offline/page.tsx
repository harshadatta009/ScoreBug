import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Offline",
  description: "You are offline. Scorebug will reconnect automatically.",
};

/**
 * Offline shell. Pre-cached by the service worker (src/app/sw.ts → `fallbacks`)
 * and served for any navigation request that misses the network. Must render
 * without auth, data fetching, or runtime config so it works fully offline.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <WifiOff className="h-8 w-8" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-bold tracking-tight">You&apos;re offline</h1>
      <p className="max-w-sm text-muted-foreground">
        Scorebug can&apos;t reach the network right now. Any scoring you do is
        saved on this device and will sync automatically when you reconnect.
      </p>
    </main>
  );
}
