import { redirect } from "next/navigation";

import { homeFor, requireUser } from "@/lib/auth";

/**
 * The role redirect.
 *
 * This cannot be static: it reads the session cookie to find out who you are,
 * which makes the route dynamic by definition. That's correct — nothing in this
 * app is cacheable across users.
 *
 * `requireUser` sends signed-out visitors to /login, so the proxy's redirect is
 * a fast path rather than the guarantee.
 */
export default async function Home() {
  const user = await requireUser();
  redirect(homeFor(user));
}
