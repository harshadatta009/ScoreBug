/// <reference lib="webworker" />
/**
 * Scorebug Service Worker (Serwist / Workbox-based).
 *
 * ARCHITECTURE NOTES
 * ──────────────────
 * 1. defaultCache handles JS/CSS/font pre-caching via Serwist's build-time
 *    manifest injection (@serwist/next injects __SW_MANIFEST at compile time).
 * 2. A StaleWhileRevalidate runtime cache covers API reads (match lists,
 *    scorecards) so the UI renders instantly from cache and refreshes silently.
 * 3. Offline fallback: any navigate request that misses the network returns
 *    the pre-cached /offline shell page.
 * 4. Background Sync: when a 'sync' event fires (device comes back online
 *    after the scorer was offline), the SW posts a SYNC_PENDING message to
 *    all open Scorebug clients; those clients call syncPending() from
 *    src/lib/offline/sync.ts. This keeps sync logic in app-land (where
 *    Supabase auth tokens live) rather than duplicating auth in the SW.
 *    Fallback: if Background Sync is unsupported, the 'online' window event
 *    handler in useOnlineStatus() calls syncPending() directly.
 * 5. Push notifications are handled here; click opens the relevant match URL.
 */

import { defaultCache } from "@serwist/next/worker";
import {
  Serwist,
  NetworkFirst,
  StaleWhileRevalidate,
  CacheFirst,
  ExpirationPlugin,
} from "serwist";
import type {
  PrecacheEntry,
  SerwistGlobalConfig,
  RouteMatchCallbackOptions,
} from "serwist";

// Serwist injects the pre-cache manifest here at build time via @serwist/next.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }

  /**
   * Background Sync API — not yet in standard TypeScript lib definitions.
   * https://developer.mozilla.org/en-US/docs/Web/API/SyncEvent
   */
  interface SyncEvent extends ExtendableEvent {
    readonly tag: string;
    readonly lastChance: boolean;
  }

  interface ServiceWorkerGlobalScopeEventMap {
    sync: SyncEvent;
  }
}

declare const self: ServiceWorkerGlobalScope;

// ─── Message type for app↔SW communication ───────────────────────────────────

interface SWMessage {
  type: "SYNC_PENDING" | "SKIP_WAITING";
}

// ─── Cache names ──────────────────────────────────────────────────────────────

const RUNTIME_CACHE_API = "scorebug-api-v1";
const RUNTIME_CACHE_INTERNAL = "scorebug-internal-api-v1";
const RUNTIME_CACHE_ASSETS = "scorebug-assets-v1";
const OFFLINE_PAGE = "/offline";

// ─── Serwist instance ─────────────────────────────────────────────────────────

const app = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  /**
   * skipWaiting: false — we want to prompt the user before activating the new
   * SW to avoid breaking an in-progress scoring session. The app sends a
   * SKIP_WAITING message after the user confirms the update banner.
   */
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: process.env["NODE_ENV"] === "production",
  runtimeCaching: [
    ...defaultCache,

    // Supabase REST API reads — stale-while-revalidate so scorecards load
    // instantly from cache then refresh silently in the background.
    {
      matcher: ({ url }: RouteMatchCallbackOptions) =>
        url.pathname.startsWith("/rest/v1/") ||
        url.hostname.endsWith(".supabase.co"),
      handler: new StaleWhileRevalidate({
        cacheName: RUNTIME_CACHE_API,
        plugins: [
          {
            // Only cache successful JSON responses; do not persist 4xx/5xx.
            cacheWillUpdate: async ({ response }: { response: Response }) => {
              if (
                response.ok &&
                response.headers.get("content-type")?.includes("json")
              ) {
                return response;
              }
              return null;
            },
          },
          new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }),
        ],
      }),
    },

    // Next.js internal API routes — network-first with a 10 s timeout so the
    // sync transport degrades to the offline queue on slow connections.
    {
      matcher: ({ url }: RouteMatchCallbackOptions) =>
        url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: RUNTIME_CACHE_INTERNAL,
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 5 }),
        ],
      }),
    },

    // Static assets (images, fonts) — cache-first, with an eviction cap so
    // the device storage doesn't grow unbounded.
    {
      matcher: ({ request }: RouteMatchCallbackOptions) =>
        request.destination === "image" || request.destination === "font",
      handler: new CacheFirst({
        cacheName: RUNTIME_CACHE_ASSETS,
        plugins: [
          new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        ],
      }),
    },
  ],
  // Pre-cache the offline shell so it's always available for navigate fallback.
  // matcher receives a HandlerDidErrorCallbackParam; we check the request mode.
  fallbacks: {
    entries: [
      {
        url: OFFLINE_PAGE,
        matcher: (param) =>
          (param.request as Request).mode === "navigate",
      },
    ],
  },
});

app.addEventListeners();

// ─── SKIP_WAITING — triggered by the update-available banner in the UI ────────

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  // Only honor messages from our own same-origin clients. A cross-origin window
  // must not be able to drive the service worker (e.g. force skipWaiting).
  // `origin` is "" for some same-origin client posts, so treat empty as same-origin.
  if (event.origin !== "" && event.origin !== self.location.origin) return;

  const data = event.data as SWMessage | undefined;
  if (data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

// ─── Background Sync ─────────────────────────────────────────────────────────

/**
 * When the 'sync' event fires (Background Sync API), delegate the actual sync
 * work to the open app clients. Auth tokens (Supabase JWT) live in the page
 * context, not in the SW — so the SW can't call the API directly. Instead it
 * posts a SYNC_PENDING message; the client's useOnlineStatus hook calls
 * syncPending() which flushes the IDB queue.
 *
 * The promise must resolve (not reject) for the Browser to consider the sync
 * job done. We resolve immediately and rely on the client to retry on failure.
 */
self.addEventListener("sync", (event: SyncEvent) => {
  if (event.tag === "scorebug-ball-sync") {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync(): Promise<void> {
  const clients = await self.clients.matchAll({
    includeUncontrolled: false,
    type: "window",
  });
  for (const client of clients) {
    (client as WindowClient).postMessage({ type: "SYNC_PENDING" } satisfies SWMessage);
  }
}

// ─── Push Notifications ───────────────────────────────────────────────────────

interface PushPayload {
  title: string;
  body: string;
  matchId?: string;
  url?: string;
  icon?: string;
  badge?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { title: "Scorebug", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon ?? "/icons/icon-192.png",
      badge: payload.badge ?? "/icons/icon-192.png",
      // tag de-duplicates: a second notification for the same match replaces the first.
      tag: payload.matchId ? `match-${payload.matchId}` : "scorebug",
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string }).url ?? "/";

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Re-use an existing tab already open on the target URL.
      const existing = clients.find((c) => (c as WindowClient).url === target);
      if (existing) {
        await (existing as WindowClient).focus();
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// ─── Offline fallback for navigation (belt-and-suspenders) ───────────────────
// Serwist's `fallbacks` option handles this at the Workbox layer. This explicit
// fetch handler is a safety net for edge cases where the precache strategy
// doesn't match (e.g., the manifest hasn't been injected in a local dev build).

self.addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      // Try exact URL, then the offline page.
      const cache = await caches.open(RUNTIME_CACHE_INTERNAL);
      return (
        (await cache.match(event.request)) ??
        (await caches.match(OFFLINE_PAGE)) ??
        new Response("Offline – please reconnect.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        })
      );
    }),
  );
});
