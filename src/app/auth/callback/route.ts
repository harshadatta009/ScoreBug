import { NextResponse } from "next/server";

import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * The OTP `type` values Supabase accepts for email verification. We validate
 * the user-supplied query param against this allowlist instead of trusting it
 * blindly, so a malformed/injected value can never steer the verify flow.
 */
const EMAIL_OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const satisfies readonly EmailOtpType[];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Supabase PKCE codes and OTP token hashes are opaque, bounded, URL-safe
 * tokens. Accepting only a well-formed token (rather than any non-empty string)
 * rejects garbage early and ensures the branch that drives the auth exchange is
 * gated on a validated value, not raw untrusted input.
 */
const AUTH_TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]{1,512}$/;

function isWellFormedToken(value: string | null): value is string {
  return value !== null && AUTH_TOKEN_PATTERN.test(value);
}

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
 *
 * Each credential is validated (format / allowlist) before it is used: the
 * real authentication decision is made server-side by Supabase (the `!error`
 * check), never by the presence of an untrusted query param.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // `next` is what Supabase forwards; `redirectTo` is our own convention.
  const redirectTo =
    searchParams.get("redirectTo") ?? searchParams.get("next") ?? "/";

  // Only allow same-origin relative redirects to avoid an open-redirect.
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/";

  const supabase = await createClient();

  if (isWellFormedToken(code)) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeRedirect}`);
  } else if (isWellFormedToken(tokenHash) && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${safeRedirect}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
