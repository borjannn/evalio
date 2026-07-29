"use server";

import { redirect } from "next/navigation";

import { clearSession } from "./session";

/**
 * Shared Server Functions.
 *
 * A "use server" module exports public HTTP endpoints — being reachable only
 * from a page you consider protected proves nothing about who called it. Any
 * action added here that does more than end a session must re-check
 * authorization itself.
 */

export async function logout(): Promise<void> {
  await clearSession();
  redirect("/login");
}
