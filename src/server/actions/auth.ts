"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Provider } from "@supabase/supabase-js";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * Authentication server actions.
 *
 * All inputs are zod-validated server-side; the browser is never trusted. Each
 * action returns a discriminated `{ ok }` result so client forms can render
 * errors inline (we avoid throwing for expected auth failures like bad
 * credentials).
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const emailSchema = z.string().email("Enter a valid email address.");
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.");

const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const signUpSchema = credentialsSchema.extend({
  fullName: z.string().min(1, "Name is required.").max(120),
});

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function signIn(formData: FormData): Promise<ActionResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signUp(formData: FormData): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // full_name is mirrored into public.users by a DB trigger on signup.
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Passwordless sign-in: emails a magic link / OTP. */
export async function signInWithOtp(formData: FormData): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const OAUTH_PROVIDERS = ["google"] as const;
const oauthSchema = z.enum(OAUTH_PROVIDERS);

/**
 * Begin an OAuth flow. On success Supabase returns a provider URL; we redirect
 * the browser to it (a server action redirect throws internally, so this never
 * returns on the happy path).
 */
export async function signInWithOAuth(formData: FormData): Promise<ActionResult> {
  const parsed = oauthSchema.safeParse(formData.get("provider"));
  if (!parsed.success) {
    return { ok: false, error: "Unsupported provider." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: parsed.data as Provider,
    options: { redirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) return { ok: false, error: error.message };
  if (data.url) redirect(data.url);
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
