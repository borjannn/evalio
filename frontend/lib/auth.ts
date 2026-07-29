import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { ApiError, apiGet } from "./api";
import type { User } from "./types";

/**
 * The Data Access Layer for identity.
 *
 * `proxy.ts` also checks the session, but only *optimistically* — it looks at
 * whether a cookie exists, because it runs on every request including prefetches
 * and must stay cheap. That check can be satisfied by a cookie holding a revoked
 * or forged token. **This** is the real one: it asks Django who the bearer is,
 * so the answer comes from the system that actually owns the session.
 *
 * Every protected page calls one of these. Never rely on the proxy alone.
 *
 * `cache()` memoizes for the duration of a single render pass, so a layout and
 * three nested Server Components calling `getUser()` produce one HTTP request,
 * not four. It is per-request — nothing leaks between users.
 */
export const getUser = cache(async (): Promise<User | null> => {
  try {
    return await apiGet<User>("/auth/me/");
  } catch (error) {
    // 401 is the ordinary "not signed in" path: no cookie, or an expired or
    // revoked token. Anything else is a real failure and should surface.
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
});

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireTeacher(): Promise<User> {
  const user = await requireUser();
  // Send a student to their own home rather than to /login — they are signed in
  // perfectly well, just not for this. Bouncing them to a login form they have
  // already satisfied reads as a broken app.
  if (user.role !== "teacher") redirect("/student");
  return user;
}

export async function requireStudent(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "student") redirect("/teacher");
  return user;
}

/** Where a signed-in user belongs. The single definition — don't inline it. */
export function homeFor(user: User): "/teacher" | "/student" {
  return user.role === "teacher" ? "/teacher" : "/student";
}
