"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

import { login, type AuthFormState } from "./actions";

/**
 * The only client-side part of signing in. `useActionState` is a hook, so this
 * leaf is a Client Component — the page around it stays a Server Component.
 *
 * The credentials go straight to a Server Function, so no token or password
 * ever passes through client-side state.
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    login,
    { error: null },
  );

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      <Field htmlFor="username" label="Username">
        {/* defaultValue, not value: React resets the form after the action, and
            the reset restores each input to its current default — which is how
            a failed attempt keeps the username instead of blanking it. */}
        <Input
          id="username"
          name="username"
          defaultValue={state.username}
          autoFocus
          autoComplete="username"
          required
        />
      </Field>

      <Field htmlFor="password" label="Password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </Field>

      {state.error && (
        // aria-live so the message is announced when it replaces nothing —
        // a screen reader gets no event from a node simply appearing.
        <p role="alert" aria-live="polite" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
