import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * Service-role Supabase client — BYPASSES Row Level Security.
 *
 * `import "server-only"` makes the bundler throw at build time if this module is
 * ever imported into client code, which is the only thing preventing the
 * service-role key from leaking to the browser. Use this ONLY for trusted
 * server-side operations that legitimately need to skip RLS (statistics
 * roll-ups, admin tooling, system notifications). Never reach for it just to
 * "make a query work" — that almost always means an RLS policy is wrong.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set; refusing to create an admin client.",
    );
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
