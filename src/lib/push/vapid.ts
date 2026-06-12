/**
 * VAPID public key utilities.
 *
 * The Web Push API requires the VAPID application server key in the form of a
 * Uint8Array (the raw bytes of the uncompressed EC public key). VAPID keys are
 * distributed as base64url-encoded strings (no padding). This helper converts
 * them to the binary form expected by PushManager.subscribe().
 */

/**
 * Convert a base64url-encoded VAPID public key to a Uint8Array.
 *
 * base64url differs from standard base64 in two character substitutions
 * ('-' for '+', '_' for '/') and omits the '=' padding. We normalise to
 * standard base64 before decoding.
 *
 * @example
 *   const key = urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!);
 *   await pushManager.subscribe({ applicationServerKey: key, userVisibleOnly: true });
 */
export function urlBase64ToUint8Array(base64UrlString: string): Uint8Array<ArrayBuffer> {
  // Pad to a multiple of 4 characters.
  const padding = "=".repeat((4 - (base64UrlString.length % 4)) % 4);
  // Substitute url-safe characters back to standard base64.
  const base64 = (base64UrlString + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawString = atob(base64);
  // Use explicit ArrayBuffer to satisfy TypeScript 5.x's stricter
  // Uint8Array<ArrayBuffer> requirement for PushSubscriptionOptionsInit.applicationServerKey.
  const buffer = new ArrayBuffer(rawString.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < rawString.length; i++) {
    bytes[i] = rawString.charCodeAt(i);
  }
  return bytes;
}
