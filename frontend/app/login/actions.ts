"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { ApiError, apiGet, apiPost } from "@/lib/api";
import { homeFor } from "@/lib/auth";
import { setSession } from "@/lib/session";
import type { User } from "@/lib/types";

/**
 * `username` is echoed back so a failed attempt doesn't wipe the field.
 *
 * React resets an uncontrolled form after a form action completes — always, not
 * only on success. The supported way to repopulate is to feed the returned state
 * back in as `defaultValue`: the reset restores each input to its *current*
 * default, which by then is the value we returned here.
 *
 * The password is deliberately not echoed.
 */
export type AuthFormState = { error: string | null; username?: string };

/**
 * Only allow same-site paths back. `//evil.com` is a protocol-relative URL that
 * browsers treat as absolute, so checking for a leading "/" alone is not enough.
 *
 * The `as Route` cast lives here, next to the validation that earns it:
 * `typedRoutes` cannot check a string that only exists at runtime, and this is
 * the one place where we know the value has been constrained.
 */
function safeNext(value: FormDataEntryValue | null): Route | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value as Route;
}

export async function login(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!username || !password) {
    return { error: "Enter your username and password.", username };
  }

  let tokens: { access: string; refresh: string };
  try {
    tokens = await apiPost<{ access: string; refresh: string }>(
      "/auth/login/",
      { username, password },
      { anonymous: true },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // One message for both cases, deliberately. Saying which field was wrong
      // confirms whether a username exists — see docs/FRONTEND.md §7.
      return { error: "Incorrect username or password.", username };
    }
    throw error;
  }

  await setSession(tokens.access, tokens.refresh);

  // The role decides the destination and only Django knows it, so ask. There is
  // no separate teacher login; this is the one screen for both roles.
  const user = await apiGet<User>("/auth/me/", { token: tokens.access });
  redirect(next ?? homeFor(user));
}
