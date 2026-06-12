import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { Logo } from "@/components/shared/Logo";
import { getUser } from "@/lib/auth/session";

export const metadata = {
  title: "Create account · Scorebug",
};

export default async function SignupPage() {
  const user = await getUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <Logo href="/" size="lg" />
      <AuthForm mode="signup" redirectTo="/dashboard" />
    </main>
  );
}
