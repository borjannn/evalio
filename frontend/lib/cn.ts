/**
 * Join conditional class names.
 *
 * Deliberately dependency-free. It does NOT resolve conflicting Tailwind
 * utilities — passing `px-2` to a component that already sets `px-4` leaves both
 * in the class list and CSS source order decides, unpredictably. That's fine
 * while overrides are layout-only (`w-full`, `mt-4`), which is all we do today.
 * If we start overriding a component's own padding or colour, add `tailwind-merge`
 * and swap the implementation here — the call sites won't change.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
