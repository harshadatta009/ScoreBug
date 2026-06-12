import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * The ONLY routes an unauthenticated visitor may reach. The app is otherwise
 * fully gated — any other path redirects to /login (preserving the intended
 * destination in `redirectTo`). The (app) pages additionally self-guard with
 * `requireUser()` and the DB's RLS is the final backstop (defense in depth).
 *
 *  - `/`              marketing landing page
 *  - `/login`,`/signup`  auth entry points
 *  - `/auth/…`        OAuth / magic-link callback
 *  - `/offline`       PWA offline fallback shell (must render with no session)
 *
 * The no-account "Try the live demo" scorer (`/match/demo/…`) is handled
 * separately below; all other `/match/*` routes require an authenticated scorer.
 */
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/auth",
  "/offline",
] as const;

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  // The demo scorer is the only publicly reachable match route.
  if (pathname === "/match/demo" || pathname.startsWith("/match/demo/")) {
    return true;
  }
  return PUBLIC_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Refresh the Supabase auth session on every request and enforce route
 * protection. This MUST run in middleware so the session cookie is rotated
 * before any Server Component reads it (otherwise users get logged out when the
 * access token silently expires).
 *
 * The flow follows the @supabase/ssr contract precisely: build one response,
 * mirror every cookie write onto BOTH the request and that response, and call
 * `getUser()` (not `getSession()`) so the token is actually validated server-side.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do NOT run code between client creation and getUser(): it forces the token
  // refresh and avoids hard-to-debug random logouts.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
