import "server-only";

import { cache } from "react";

import type { User } from "@supabase/supabase-js";

import type { AppRole } from "@/domain/cricket/enums";
import { asId, type UserId } from "@/domain/shared/ids";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-side session helpers.
 *
 * `getUser` validates the JWT with the auth server (unlike `getSession`, which
 * only decodes the cookie) so callers can trust the result for authorization.
 * Wrapped in React `cache` so multiple calls within one request/render share a
 * single round-trip.
 */

export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The authenticated user's branded id, or null. */
export async function getUserId(): Promise<UserId | null> {
  const user = await getUser();
  return user ? asId<"UserId">(user.id) : null;
}

/**
 * The global RBAC roles granted to the current user, from `public.user_roles`.
 * Returns `[]` when signed out. Cached per-request.
 */
export const getUserRoles = cache(async (): Promise<AppRole[]> => {
  const user = await getUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (error || !data) return [];
  return data.map((r) => r.role);
});

/** Throw-on-missing variant for routes/actions that require authentication. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
