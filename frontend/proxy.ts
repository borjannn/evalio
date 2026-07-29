import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE,
  REFRESH_COOKIE,
  cookieOptions,
} from "@/lib/cookies";

/**
 * Proxy — this is Next 16's name for what used to be Middleware. The file must
 * be `proxy.ts` at the project root; a `middleware.ts` here does nothing.
 *
 * Two jobs, both deliberately cheap because this runs on *every* request,
 * including link prefetches:
 *
 *  1. Silent token refresh. The access cookie's max-age matches the JWT's
 *     lifetime, so when the token expires the browser simply stops sending the
 *     cookie. "Refresh present, access absent" is therefore a reliable
 *     expiry signal that needs no JWT parsing.
 *  2. An optimistic redirect for signed-out visitors.
 *
 * ⚠️ The redirect is NOT authorization. It only proves a cookie exists — the
 * value could be revoked or forged. Real enforcement is `lib/auth.ts`, which
 * asks Django who the bearer is, and Django re-checks ownership on every
 * endpoint regardless. Deleting this file would cost a redirect, not security.
 */

const PUBLIC_PATHS = ["/login", "/register"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  // 1. Access expired but the session is still good — mint a new access token.
  if (!access && refresh) {
    const refreshed = await refreshAccessToken(refresh);
    if (refreshed) {
      const response = NextResponse.next();
      response.cookies.set(ACCESS_COOKIE, refreshed, {
        ...cookieOptions,
        maxAge: ACCESS_MAX_AGE,
      });
      return response;
    }
    // Refresh itself expired or was rejected: drop both cookies so the user
    // gets a clean signed-out state instead of looping through a dead refresh
    // on every single request.
    const response = redirectToLogin(request);
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  // 2. No session at all, on a page that needs one.
  if (!access && !refresh && !isPublic) {
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  // Remember where they were headed so login can return them there. Only the
  // path — a full URL here would be an open-redirect hole.
  if (request.nextUrl.pathname !== "/") {
    url.searchParams.set("next", request.nextUrl.pathname);
  }
  return NextResponse.redirect(url);
}

async function refreshAccessToken(refresh: string): Promise<string | null> {
  try {
    const response = await fetch(`${process.env.DJANGO_API_URL}/auth/login/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { access?: string };
    return data.access ?? null;
  } catch {
    // Django unreachable. Treat as "not refreshed" rather than throwing — a
    // failure here would 500 every route in the app at once.
    return null;
  }
}

export const config = {
  // Everything except Next's own assets and the favicon. The auth guide
  // recommends running proxy on all routes rather than an allowlist, so that a
  // new protected route is covered the moment it exists.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
