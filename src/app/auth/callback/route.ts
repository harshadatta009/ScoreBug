import { NextResponse } from "next/server";

import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback handler.
 *
 * Supabase redirects here after:
 *  - an OAuth flow (Google) — arrives with `?code=...` (PKCE), or
 *  - a magic-link / email-confirmation click — arrives with `?token_hash=...&type=...`.
 *
 * We exchange whichever credential is present for a session cookie, then send
 * the user on to `redirectTo` (defaults to the dashboard). On failure we bounce
 * back to /login with an error flag so the form can surface it.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // `next` is what Supabase forwards; `redirectTo` is our own convention.
  const redirectTo =
    searchParams.get("redirectTo") ?? searchParams.get("next") ?? "/";

  // Only allow same-origin relative redirects to avoid an open-redirect.
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeRedirect}`);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${safeRedirect}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
