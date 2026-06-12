import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * Server Supabase client, bound to the request's cookie jar.
 *
 * In Next 15 `cookies()` is async, so this helper is async too. Use it inside
 * Server Components, Route Handlers and Server Actions. The `setAll` writes are
 * wrapped in try/catch because cookies cannot be mutated from a Server
 * Component render — there session refresh is handled by the middleware
 * (`updateSession`), so swallowing the error is correct rather than fatal.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component where cookies are read-only.
            // Safe to ignore — middleware refreshes the session cookie.
          }
        },
      },
    },
  );
}
