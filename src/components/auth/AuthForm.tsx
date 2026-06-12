"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  signIn,
  signUp,
  signInWithOtp,
  signInWithOAuth,
  type ActionResult,
} from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Mode = "login" | "signup";

interface AuthFormProps {
  mode: Mode;
  /** Where to send the user after a successful password sign-in. */
  redirectTo: string;
  /** Pre-set error flag from the callback redirect (e.g. ?error=auth_callback). */
  initialError?: string | null;
}

/**
 * Unified auth form for login and signup.
 *
 * The heavy lifting (validation, Supabase calls) lives in server actions; this
 * component only manages form state, pending UI and post-action navigation.
 * Password sign-in navigates client-side on success; passwordless / OAuth flows
 * are completed via email link or provider redirect, so we show a confirmation
 * message instead.
 */
export function AuthForm({ mode, redirectTo, initialError }: AuthFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(
    initialError ? "Sign-in could not be completed. Please try again." : null,
  );
  const [notice, setNotice] = React.useState<string | null>(null);

  const isSignup = mode === "signup";

  function run(action: () => Promise<ActionResult | void>, onOk?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      // OAuth redirects server-side, so result may be void.
      if (result && !result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      onOk?.();
    });
  }

  function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    run(
      () => (isSignup ? signUp(formData) : signIn(formData)),
      () => {
        if (isSignup) {
          setNotice(
            "Account created. Check your email to confirm, then sign in.",
          );
        } else {
          router.push(redirectTo);
          router.refresh();
        }
      },
    );
  }

  function handleMagicLink() {
    if (!email) {
      setError("Enter your email first, then request a magic link.");
      return;
    }
    const fd = new FormData();
    fd.set("email", email);
    run(
      () => signInWithOtp(fd),
      () => setNotice("Magic link sent. Check your email to sign in."),
    );
  }

  function handleGoogle() {
    const fd = new FormData();
    fd.set("provider", "google");
    // signInWithOAuth redirects server-side on success; no onOk needed.
    run(() => signInWithOAuth(fd));
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">
          {isSignup ? "Create your account" : "Welcome back"}
        </CardTitle>
        <CardDescription>
          {isSignup
            ? "Start scoring matches in minutes."
            : "Sign in to score and manage your cricket."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          {isSignup && (
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                name="fullName"
                autoComplete="name"
                required
                placeholder="Virat Kohli"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-four">
              {notice}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending
              ? "Please wait…"
              : isSignup
                ? "Create account"
                : "Sign in"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isPending}
            onClick={handleMagicLink}
          >
            Email me a magic link
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isPending}
            onClick={handleGoogle}
          >
            Continue with Google
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New to Scorebug?{" "}
              <Link
                href="/signup"
                className="font-medium text-primary underline"
              >
                Create an account
              </Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
