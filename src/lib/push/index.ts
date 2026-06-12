/**
 * Push notification subscription utilities.
 *
 * VAPID (Voluntary Application Server Identification) allows the push service
 * to validate that notifications come from our authorised server, preventing
 * third parties from sending unsolicited pushes to our subscribers.
 *
 * FLOW
 * ────
 * 1. The user grants notification permission.
 * 2. subscribeToPush() calls PushManager.subscribe() with our VAPID public key.
 * 3. The resulting PushSubscription is sent to POST /api/push/subscribe, which
 *    upserts it into the `push_subscriptions` table.
 * 4. The server sends pushes via the Web Push Protocol (RFC 8030) using the
 *    private VAPID key (server-side only, never exposed to the client).
 */

export { subscribeToPush, unsubscribeFromPush, getExistingSubscription } from "./subscribe";
export { urlBase64ToUint8Array } from "./vapid";
