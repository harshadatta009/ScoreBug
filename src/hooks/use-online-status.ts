"use client";

/**
 * useOnlineStatus — tracks network connectivity and effective connection type.
 *
 * DESIGN NOTES
 * ────────────
 * `navigator.onLine` is a coarse signal: it is `true` even on a captive-portal
 * wifi that can't reach the internet. We use it as an optimistic indicator —
 * the sync engine has its own retry logic for when `onLine` is true but the
 * server is unreachable.
 *
 * The Network Information API (`navigator.connection`) gives richer data
 * (effectiveType: '4g' | '3g' | '2g' | 'slow-2g') but is only available in
 * Chromium-based browsers. We type it as optional and degrade gracefully.
 *
 * BACKGROUND SYNC FALLBACK
 * ────────────────────────
 * When the device comes back online and the Background Sync API is unavailable
 * (Firefox, Safari), we call syncPending() directly from the 'online' event
 * handler. This gives near-instant flush on reconnect across all browsers.
 */

import { useState, useEffect, useCallback } from "react";
import { syncPending, registerBackgroundSync } from "@/lib/offline/sync";

// ─── Network Information API types (not in lib.dom.d.ts yet) ─────────────────

type EffectiveConnectionType = "slow-2g" | "2g" | "3g" | "4g";

interface NetworkInformation extends EventTarget {
  readonly effectiveType: EffectiveConnectionType;
  readonly downlink: number;
  readonly rtt: number;
  readonly saveData: boolean;
  onchange: EventListenerOrEventListenerObject | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface OnlineStatus {
  /** True when the browser believes it has network access. */
  isOnline: boolean;
  /**
   * Effective connection type as reported by the Network Information API.
   * `null` when the API is unavailable (Firefox, Safari) or when offline.
   */
  effectiveType: EffectiveConnectionType | null;
  /** True when the device is on a metered / slow connection (saveData hint). */
  isSaveData: boolean;
}

function getConnection(): NetworkInformation | null {
  if (typeof navigator === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Network Information API is non-standard
  return (navigator as any).connection as NetworkInformation | null ?? null;
}

function readCurrentStatus(): OnlineStatus {
  if (typeof navigator === "undefined") {
    // SSR — assume online to avoid hydration mismatches.
    return { isOnline: true, effectiveType: null, isSaveData: false };
  }
  const conn = getConnection();
  return {
    isOnline: navigator.onLine,
    effectiveType: conn?.effectiveType ?? null,
    isSaveData: conn?.saveData ?? false,
  };
}

export function useOnlineStatus(): OnlineStatus {
  const [status, setStatus] = useState<OnlineStatus>(readCurrentStatus);

  const refresh = useCallback(() => {
    setStatus(readCurrentStatus());
  }, []);

  const handleOnline = useCallback(() => {
    setStatus(readCurrentStatus());

    // Trigger a sync flush when connectivity is restored.
    // registerBackgroundSync is a no-op if the Background Sync API is available
    // (the SW handles it); otherwise it's a direct flush trigger.
    void registerBackgroundSync().then(() => {
      // Fallback flush for browsers without Background Sync (Firefox, Safari).
      // The SW's 'sync' event already calls syncPending() via postMessage in
      // supported browsers — we call it here only as a belt-and-suspenders
      // fallback. The per-innings mutex in syncPending() prevents double-submission.
      void syncPending();
    });
  }, []);

  useEffect(() => {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", refresh);

    const conn = getConnection();
    if (conn) {
      conn.addEventListener("change", refresh);
    }

    // Listen for SYNC_PENDING messages from the service worker (fired after
    // Background Sync event).
    const handleSWMessage = (event: MessageEvent) => {
      if (
        event.data &&
        typeof event.data === "object" &&
        (event.data as { type?: string }).type === "SYNC_PENDING"
      ) {
        void syncPending();
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSWMessage);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", refresh);
      conn?.removeEventListener("change", refresh);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSWMessage);
      }
    };
  }, [handleOnline, refresh]);

  return status;
}
