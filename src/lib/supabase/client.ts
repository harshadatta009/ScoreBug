import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * Browser Supabase client.
 *
 * Safe to call repeatedly: @supabase/ssr memoizes the underlying singleton per
 * browsing context, so this can be invoked from any Client Component without
 * spawning duplicate realtime connections. Only the public anon key is used —
 * never a service-role key here.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
