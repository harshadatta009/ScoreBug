import {
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
} from "@tanstack/react-query";

/**
 * QueryClient factory.
 *
 * Defaults tuned for a live-scoring PWA: a short `staleTime` so the browser
 * shows fresh scores without hammering the network, and realtime subscriptions
 * (see `use-supabase-realtime`) push invalidations for instant updates. We
 * dehydrate pending queries too, so streamed SSR data can hydrate seamlessly.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      dehydrate: {
        // Include in-flight queries so SSR streaming hydrates without flicker.
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Returns the QueryClient for the current environment. On the server we always
 * create a fresh client (never share state across requests); in the browser we
 * memoize one instance so it survives React suspense re-renders.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
