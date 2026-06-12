"use client";

import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";

import { getQueryClient } from "@/lib/query/query-client";
import { Toaster } from "@/components/ui/toaster";

/**
 * Providers — root client-side provider tree.
 *
 * Must be a client component because TanStack Query and next-themes both
 * require browser context. The QueryClient is memoised in useState so it is
 * created exactly once per page load and not recreated on re-renders.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // getQueryClient memoises a single browser instance and creates fresh
  // per-request clients on the server, keeping SSR and client in sync.
  const [queryClient] = React.useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster />
      </ThemeProvider>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
