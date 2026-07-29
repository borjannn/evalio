"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

import { register, type AuthFormState } from "./actions";

/**
 * ⚠️ There is deliberately no role control here, and one must not be added.
 * Registration always creates a student; the API ignores `role` in the body.
 * An earlier draft of the spec called role "the highest-consequence field on
 * the screen" and proposed a segmented control — that guidance is dead.
 */
export function RegisterForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    register,
    { error: null },
  );

  return (
    <form action={formAction} className="space-y-4">
      {/* defaultValue keeps the four non-secret fields across a rejected
          submission — see the note in ./actions.ts. */}
      <Field htmlFor="username" label="Username">
        <Input
          id="username"
          name="username"
          defaultValue={state.values?.username}
          autoFocus
          autoComplete="username"
          required
        />
      </Field>

      <Field htmlFor="email" label="Email">
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={state.values?.email}
          autoComplete="email"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field htmlFor="first_name" label="First name">
          <Input
            id="first_name"
            name="first_name"
            defaultValue={state.values?.first_name}
            autoComplete="given-name"
          />
        </Field>
        <Field htmlFor="last_name" label="Last name">
          <Input
            id="last_name"
            name="last_name"
            defaultValue={state.values?.last_name}
            autoComplete="family-name"
          />
        </Field>
      </div>

      <Field htmlFor="password" label="Password" hint="At least 6 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
        />
      </Field>

      {state.error && (
        <p role="alert" aria-live="polite" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create student account"}
      </Button>
    </form>
  );
}
