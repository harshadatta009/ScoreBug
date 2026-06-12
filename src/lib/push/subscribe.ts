/**
 * Push subscription management.
 *
 * PERMISSION MODEL
 * ────────────────
 * We request permission lazily — only when the user explicitly opts in to
 * notifications (e.g., by toggling a "Live match alerts" switch). Requesting
 * permission proactively on first load is a UX anti-pattern that increases
 * denial rates.
 *
 * The subscription is sent to /api/push/subscribe for persistence in the
 * `push_subscriptions` table. The server upserts on (user_id, endpoint) to
 * handle re-subscriptions after browser data is cleared.
 */

import { urlBase64ToUint8Array } from "./vapid";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubscribeOptions {
  /**
   * The VAPID public key to use. Defaults to NEXT_PUBLIC_VAPID_PUBLIC_KEY.
   * Override in tests to avoid touching process.env.
   */
  vapidPublicKey?: string;

  /**
   * The URL to POST the subscription to. Defaults to /api/push/subscribe.
   */
  endpoint?: string;
}

export type SubscribeResult =
  | { ok: true; subscription: PushSubscription }
  | { ok: false; reason: "permission_denied" | "unsupported" | "error"; message: string };

// ─── Subscribe ────────────────────────────────────────────────────────────────

/**
 * Request notification permission and create a PushSubscription.
 *
 * Sends the subscription to the server so it can deliver pushes.
 * Idempotent — calling it when already subscribed returns the existing
 * subscription without creating a duplicate server record (upsert on endpoint).
 *
 * @returns A discriminated union so callers can handle each failure mode.
 */
export async function subscribeToPush(
  options: SubscribeOptions = {},
): Promise<SubscribeResult> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return {
      ok: false,
      reason: "unsupported",
      message: "Service workers are not supported in this environment.",
    };
  }

  if (!("PushManager" in window)) {
    return {
      ok: false,
      reason: "unsupported",
      message: "Push notifications are not supported in this browser.",
    };
  }

  // Request (or check existing) notification permission.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason: "permission_denied",
      message: "Notification permission was denied.",
    };
  }

  const vapidKey =
    options.vapidPublicKey ?? process.env["NEXT_PUBLIC_VAPID_PUBLIC_KEY"] ?? "";

  if (!vapidKey) {
    return {
      ok: false,
      reason: "error",
      message: "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured.",
    };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    // Persist subscription on the server.
    const serverUrl = options.endpoint ?? "/api/push/subscribe";
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (!response.ok) {
      // The sub is active browser-side but the server didn't persist it.
      // We still return ok: true because the subscription itself succeeded —
      // the UI can retry the server persist later.
      console.error("[Scorebug Push] Failed to save subscription on server:", response.status);
    }

    return { ok: true, subscription };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message : "Unknown error during push subscription.",
    };
  }
}

// ─── Unsubscribe ──────────────────────────────────────────────────────────────

/**
 * Unsubscribe from push notifications and notify the server to remove the
 * subscription record.
 *
 * @returns true if the browser unsubscribed successfully (server DELETE is
 *          best-effort — a leftover record is harmless as pushes will fail).
 */
export async function unsubscribeFromPush(endpoint?: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true; // already unsubscribed

    // Notify server first so it can remove the record before the browser
    // invalidates the endpoint.
    await fetch(endpoint ?? "/api/push/unsubscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {/* best-effort */});

    return subscription.unsubscribe();
  } catch {
    return false;
  }
}

// ─── Read existing subscription ───────────────────────────────────────────────

/**
 * Return the current PushSubscription if one exists, without requesting
 * permission. Useful for determining whether to show an "Enable notifications"
 * toggle as checked on the settings page.
 */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}
