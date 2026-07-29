import "server-only";

import { cookies } from "next/headers";

import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  cookieOptions,
} from "./cookies";

export {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  cookieOptions,
} from "./cookies";

/** `cookies()` is async in Next 16 — awaiting it is not optional. */
export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}

/**
 * Only callable from a Route Handler or a Server Function. Next throws if a
 * Server Component tries to write a cookie during render.
 */
export async function setSession(access: string, refresh: string): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, access, { ...cookieOptions, maxAge: ACCESS_MAX_AGE });
  store.set(REFRESH_COOKIE, refresh, { ...cookieOptions, maxAge: REFRESH_MAX_AGE });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}
