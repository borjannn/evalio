"use server";

import { redirect } from "next/navigation";

import { ApiError, apiPost } from "@/lib/api";
import { setSession } from "@/lib/session";
import type { User } from "@/lib/types";

/**
 * Everything except the password is echoed back, so a rejected submission
 * doesn't make the user retype four fields. See the note in ../login/actions.ts
 * about why React needs this fed back through `defaultValue`.
 */
export type AuthFormState = {
  error: string | null;
  values?: { username: string; email: string; first_name: string; last_name: string };
};

/**
 * Registration always creates a **student**.
 *
 * No `role` is sent, and sending one would change nothing: `RegisterSerializer`
 * lists `role` in `read_only_fields` and forces `Role.STUDENT` server-side.
 * Letting anyone self-select "teacher" would hand out the entire authoring API
 * plus a view of other teachers' students.
 *
 * Do not add a role control to the form. See docs/FRONTEND.md §7.
 */
export async function register(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const values = {
    username: String(formData.get("username") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    first_name: String(formData.get("first_name") ?? "").trim(),
    last_name: String(formData.get("last_name") ?? "").trim(),
  };
  const { username } = values;

  if (!username || !password) {
    return { error: "Enter a username and password.", values };
  }
  if (password.length < 6) {
    // Mirrors RegisterSerializer's min_length so the user gets the message
    // without a round trip. Django remains the real check.
    return { error: "Password must be at least 6 characters.", values };
  }

  try {
    await apiPost<User>("/auth/register/", { ...values, password }, { anonymous: true });
  } catch (error) {
    // 400 is the ordinary "username taken" / invalid email path.
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage, values };
    }
    throw error;
  }

  // Sign them straight in rather than bouncing to /login to retype what they
  // just typed.
  const tokens = await apiPost<{ access: string; refresh: string }>(
    "/auth/login/",
    { username, password },
    { anonymous: true },
  );
  await setSession(tokens.access, tokens.refresh);

  // No role check needed: this endpoint cannot produce anything but a student.
  redirect("/student");
}
