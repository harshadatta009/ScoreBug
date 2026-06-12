import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { Logo } from "@/components/shared/Logo";
import { getUser } from "@/lib/auth/session";

export const metadata = {
  title: "Sign in · Scorebug",
};

interface LoginPageProps {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirectTo, error } = await searchParams;

  // Already signed in? Skip the form.
  const user = await getUser();
  if (user) redirect(redirectTo && redirectTo.startsWith("/") ? redirectTo : "/");

  const safeRedirect =
    redirectTo && redirectTo.startsWith("/") ? redirectTo : "/";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <Logo href="/" size="lg" />
      <AuthForm mode="login" redirectTo={safeRedirect} initialError={error} />
    </main>
  );
}
