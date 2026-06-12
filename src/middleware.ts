import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Root middleware. Delegates to `updateSession`, which refreshes the Supabase
 * auth cookie and enforces route protection. Must run on (almost) every request
 * so the access token is rotated before any Server Component reads it.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * Run on all paths EXCEPT Next internals and static assets. Matching those
   * would needlessly hit the auth server (and break image optimization), so we
   * exclude `_next/static`, `_next/image`, the favicon, the PWA service worker
   * + manifest, and common static file extensions.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
