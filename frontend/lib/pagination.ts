/**
 * Reading page numbers out of a URL.
 *
 * `searchParams` values arrive as `string | string[] | undefined` — a repeated
 * `?page=2&page=9` is an array, and both a missing parameter and `?page=banana`
 * have to land somewhere sensible rather than producing `NaN` and a request for
 * `?page=NaN`, which Django answers with a 404.
 *
 * Not in `lib/constants.ts` because that file is for values mirrored from the
 * backend, and not in an actions file because a `"use server"` module may export
 * only async functions.
 */
export function pageFrom(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  // `Number("")` is 0 and `Number(undefined)` is NaN; both mean "page 1".
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.trunc(parsed));
}
