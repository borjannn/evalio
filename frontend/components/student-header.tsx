import { LogOut } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { NameReveal } from "@/components/name-reveal";
import { NavLink } from "@/components/nav-link";
import { logout } from "@/lib/actions";
import type { User } from "@/lib/types";

/**
 * The student shell's header — `Quizzes` · `History` · `Guide` · sign out (docs/FRONTEND.md §6).
 *
 * A component the screens render rather than a layout, because docs/FRONTEND.md §6 makes the
 * runner (docs/FRONTEND.md §6) an explicit exception: a student who navigates away mid-attempt
 * loses their place, so it shows a stripped header of its own instead. A layout
 * would wrap the runner too, and there is no way for a page to opt out of one.
 *
 * The alternative was a `(shell)` route group, which would put `attempts/
 * [attemptId]` in two places in the tree to express one difference. This costs a
 * re-render of a header on navigation; that costs a reader's ability to find a
 * route by its path.
 */
export function StudentHeader({ user }: { user: User }) {
  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-3xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link
            href="/student"
            aria-label="Evalio home"
            className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Brand />
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
            <NavLink href="/student" exact>
              Quizzes
            </NavLink>
            <NavLink href="/student/history">History</NavLink>
            <NavLink href="/student/tutorial">Guide</NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden sm:inline">
            <NameReveal name={displayName} />
          </span>
          <form action={logout}>
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              className="pressable rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

/** The shelled student screens' page frame. Narrower than the teacher's — docs/FRONTEND.md §5. */
export function StudentShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <StudentHeader user={user} />
      <main className="page-enter mx-auto w-full max-w-3xl flex-1 px-4 py-10 md:px-6">{children}</main>
    </div>
  );
}
