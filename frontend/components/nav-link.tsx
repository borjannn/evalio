"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

/**
 * A header nav item that knows whether it is current.
 *
 * `usePathname` is a hook, so this leaf is a Client Component while the header
 * around it stays on the server. That is the whole reason it is its own file —
 * putting the directive on the layout would ship the user lookup to the browser.
 */
export function NavLink({
  href,
  children,
  exact = false,
}: {
  href: Route;
  children: React.ReactNode;
  /** Match the path exactly. Use for "/teacher", which is a prefix of every other tab. */
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      // aria-current is what tells a screen reader which tab is active; the
      // background colour alone conveys nothing to one.
      aria-current={active ? "page" : undefined}
      className={cn(
        // `pressable` carries the transition as well as the lift, which is why
        // `transition-colors` is gone rather than sitting beside it: that
        // utility is in a later cascade layer and would narrow
        // `transition-property` back to colours, leaving the lift to snap.
        "pressable rounded-md px-3 py-2",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        // Tinted with the brand colour rather than filled grey. `aria-current`
        // above is what actually conveys "you are here"; this is the visual echo.
        active
          ? "bg-primary/10 text-primary"
          : "hover:bg-secondary hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
