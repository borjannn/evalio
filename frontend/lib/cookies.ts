/**
 * Cookie names and lifetimes, with no imports.
 *
 * Kept separate from lib/session.ts because `proxy.ts` needs these constants but
 * runs in a context where `next/headers` is unavailable — it reads cookies off
 * the request object instead. Importing session.ts there would drag `cookies()`
 * in with it.
 *
 * Both cookies are httpOnly, so no token is readable from `document.cookie`.
 *
 * The lifetimes mirror Django's SIMPLE_JWT settings, and that is load-bearing:
 * when the access cookie expires the browser stops sending it, and proxy.ts
 * treats "refresh present, access absent" as the signal to mint a new access
 * token. Change one side without the other and sessions either die early or
 * linger past the token's real validity.
 */

export const ACCESS_COOKIE = "evalio_access";
export const REFRESH_COOKIE = "evalio_refresh";

/** SIMPLE_JWT.ACCESS_TOKEN_LIFETIME — timedelta(hours=2) */
export const ACCESS_MAX_AGE = 60 * 60 * 2;
/** SIMPLE_JWT.REFRESH_TOKEN_LIFETIME — timedelta(days=7) */
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 7;

export const cookieOptions = {
  httpOnly: true,
  // Lax rather than Strict so arriving from an external link keeps you signed
  // in. Every mutation goes through a Server Function, which Next protects
  // against cross-origin invocation, so there is no cross-site POST surface.
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;
