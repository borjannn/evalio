import { LogOut } from "lucide-react";
import Link from "next/link";

import { NavLink } from "@/components/nav-link";
import { logout } from "@/lib/actions";
import { requireTeacher } from "@/lib/auth";

/**
 * The teacher shell — sticky header, `max-w-6xl` container (Guidelines §4).
 *
 * A plain `app/teacher/layout.tsx` rather than a `(teacher)` route group: every
 * teacher screen already lives under /teacher/*, so a group would add a folder
 * and change nothing.
 *
 * `requireTeacher()` here covers every nested route, but nested pages call it
 * again — layouts do not re-run on client-side navigation between their own
 * children, so a layout is the wrong place to put the only check.
 */
export default async function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  const user = await requireTeacher();
  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link
              href="/teacher"
              className="text-lg font-bold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Evalio
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
              <NavLink href="/teacher" exact>
                Dashboard
              </NavLink>
              <NavLink href="/teacher/classes">Classes</NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">{displayName}</span>
            {/* A form posting to a Server Function — no client component, and it
                works with JavaScript disabled. */}
            <form action={logout}>
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
