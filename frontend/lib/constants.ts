/**
 * Values mirrored from the backend that both server and client code need.
 *
 * This file exists because a `"use server"` module may export **only async
 * functions** — a constant beside a Server Function is a build error that
 * neither `tsc` nor eslint reports, since it is a bundler rule rather than a type
 * or lint rule. Same reason `lib/cookies.ts` is separate from `lib/session.ts`.
 *
 * Anything here is duplicated from Django and can drift. Name the source.
 */

/** `classes/views.py::MIN_SEARCH_LENGTH`. The API returns 400 below this. */
export const MIN_SEARCH_LENGTH = 3;

/**
 * `evalio/settings.py::REST_FRAMEWORK["PAGE_SIZE"]`. There is no "return
 * everything" parameter, so every list screen needs a way to reach row 26
 * (docs/FRONTEND.md §4). `<Pager>` uses this to turn a page number into "1–25 of N".
 */
export const PAGE_SIZE = 25;
