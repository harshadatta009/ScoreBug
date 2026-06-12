import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * Routes an unauthenticated visitor may reach. Everything else requires a
 * session. Public reads (profiles, scorecards, leaderboards) are allowed so
 * pages are shareable like CricHeroes; the create/edit pages under these
 * prefixes self-guard with `requireUser()` and the DB's RLS is the backstop.
 */
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/auth", // OAuth / magic-link callback
  "/match", // full-screen live scorer + public scorecards
  "/matches", // match list + summaries
  "/teams", // team profiles + squads
  "/players", // public player profiles
  "/tournaments", // tournament hub, fixtures, points tables
  "/stats", // leaderboards
  "/", // landing page
] as const;

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATH_PREFIXES.some(
    (p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`)),
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
