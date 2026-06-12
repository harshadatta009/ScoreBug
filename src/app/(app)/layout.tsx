import { BottomNav } from "@/components/shared/BottomNav";

/**
 * App-shell layout for authenticated / main app routes.
 *
 * Provides the persistent bottom navigation and ensures page content is
 * padded above the nav bar height (h-16 = 4rem) so nothing is hidden.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 pb-16">{children}</main>
      <BottomNav />
    </div>
  );
}
