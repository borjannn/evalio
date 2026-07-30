import Link from "next/link";
import { redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { Card } from "@/components/ui/card";
import { getUser, homeFor } from "@/lib/auth";

import { RegisterForm } from "./register-form";

export const metadata = { title: "Create an account — Evalio" };

export default async function RegisterPage() {
  const user = await getUser();
  if (user) redirect(homeFor(user));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <Brand size="lg" />

      <Card className="w-full max-w-md p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Create a student account</h1>
          {/* The copy has to say "student" plainly. A teacher who signs up here
              gets a working account that can see nothing, which reads as a
              broken app rather than as the wrong account type. */}
          <p className="mt-2 text-sm text-muted-foreground">
            Sign-up is for students. Teacher accounts are created by an administrator.
          </p>
        </div>

        <RegisterForm />

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </div>
      </Card>
    </div>
  );
}
