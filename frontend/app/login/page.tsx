import Link from "next/link";
import { redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { Card } from "@/components/ui/card";
import { getUser, homeFor } from "@/lib/auth";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Evalio" };

/**
 * One login screen for both roles. There is no separate teacher login: the role
 * comes back from Django and decides the destination (docs/FRONTEND.md §7).
 */
export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  // searchParams is a Promise in Next 16.
  const { next } = await searchParams;

  // Already signed in — don't show a login form to someone who has a session.
  const user = await getUser();
  if (user) redirect(homeFor(user));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      {/* The wordmark is the subject here, not a nav item, so it sits above the
          card at `lg` and draws itself as the page arrives. */}
      <Brand size="lg" />

      <Card className="w-full max-w-sm p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Welcome back. Please enter your details.
          </p>
        </div>

        <LoginForm next={typeof next === "string" ? next : undefined} />

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-foreground hover:underline">
            Sign up as a student
          </Link>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Teacher accounts are created by an administrator.
        </p>
      </Card>
    </div>
  );
}
