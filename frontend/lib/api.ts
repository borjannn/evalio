import "server-only";

import { getAccessToken } from "./session";

/**
 * The only module that talks to Django.
 *
 * `import "server-only"` makes the build fail if this is ever pulled into a
 * client bundle, which is the guard that keeps the access token server-side.
 * Never `fetch` Django from a Client Component; call a Server Component or a
 * Server Function that uses this instead.
 */

const BASE_URL = process.env.DJANGO_API_URL;

if (!BASE_URL) {
  // Fail at import time with a useful message rather than producing a fetch to
  // "undefined/topics/" at request time.
  throw new Error(
    "DJANGO_API_URL is not set. Copy frontend/env_example to frontend/.env.local.",
  );
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly data: unknown,
    message?: string,
  ) {
    super(message ?? `Django returned ${status}`);
    this.name = "ApiError";
  }

  /**
   * DRF puts field errors at `{field: ["msg"]}` and form-wide errors under
   * `non_field_errors` or `detail`. Flatten to one line for display.
   */
  get formMessage(): string {
    const data = this.data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const detail = record.detail ?? record.non_field_errors;
      const first = Array.isArray(detail) ? detail[0] : detail;
      if (typeof first === "string") return first;

      for (const value of Object.values(record)) {
        const message = Array.isArray(value) ? value[0] : value;
        if (typeof message === "string") return message;
      }
    }
    return this.message;
  }
}

type RequestOptions = {
  /** Send without an Authorization header — login and register only. */
  anonymous?: boolean;
  /**
   * Use this token instead of the session cookie.
   *
   * Needed immediately after signing in: the login action has just written the
   * cookie on the outgoing response, and rather than depend on whether a read
   * in the same request observes that write, it passes the token it already
   * holds. Explicit beats subtle here.
   */
  token?: string;
};

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};

  if (!options.anonymous) {
    const token = options.token ?? (await getAccessToken());
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    // Every response here is per-user. Caching one would serve one student's
    // attempt to another. Next 16 doesn't cache fetch by default, but say so
    // explicitly so a future default change can't quietly break it.
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Django returned HTML (a 500 debug page, usually). Keep the raw text.
    }
    throw new ApiError(response.status, parsed);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Generic on purpose. An `apiGet` returning `any` would stop the types at the
 * fetch boundary and make the whole TypeScript decision pointless — pass the
 * shape from lib/types.ts, e.g. `apiGet<Paginated<Topic>>("/topics/")`.
 */
export function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>("GET", path, undefined, options);
}

/**
 * Every page of a paginated endpoint, concatenated.
 *
 * For lists that are **not** browsed but *chosen from*: the topics behind a
 * group's topic picker, the classes and groups behind the assign screen's
 * targets. A `<Pager>` is the answer when a teacher is reading a list; it is no
 * answer at all when the list is `<option>`s, because a topic sitting on page 2
 * is simply unpickable and nothing on screen explains why.
 *
 * Serial by necessity — `next` is only known once the previous page is back —
 * so keep it to option-sized lists. `maxPages` is a stop against a pathological
 * account rather than a tuning knob: hitting it returns what it has, which for a
 * picker degrades to today's behaviour rather than hanging the page.
 */
export async function apiGetAll<T>(
  path: string,
  options?: RequestOptions & { maxPages?: number },
): Promise<T[]> {
  const { maxPages = 20, ...requestOptions } = options ?? {};
  const separator = path.includes("?") ? "&" : "?";
  const results: T[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    // Counting pages rather than following the envelope's `next`. `next` is an
    // absolute URL built from the request *Django* saw, so behind a container or
    // a proxy its host is not necessarily one this process can slice a path back
    // out of. The page number is ours either way.
    const body: { results: T[]; next: string | null } = await request(
      "GET",
      `${path}${separator}page=${page}`,
      undefined,
      requestOptions,
    );
    results.push(...body.results);
    if (!body.next) break;
  }

  return results;
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  return request<T>("POST", path, body, options);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PATCH", path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}
