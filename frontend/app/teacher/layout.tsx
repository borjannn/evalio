import { LogOut } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { NavLink } from "@/components/nav-link";
import { logout } from "@/lib/actions";
import { requireTeacher } from "@/lib/auth";

/**
 * The teacher shell — sticky header, `max-w-7xl` container.
 *
 * docs/FRONTEND.md §5 said `max-w-6xl`, and 1152px stopped being enough once the
 * screens got denser: three metric badges no longer fit one line on a dashboard
 * card, and the statistics table carries seven columns. The header and the main
 * column have to carry the same value or the logo stops sitting above the
 * content.
 *
 * ⚠️ This widens the *shell*, not the reading measure. Prose is still capped
 * where it is set — `PageHeader`'s description at `max-w-2xl`, forms at
 * `max-w-xl` — because a 1280px line of body text is unreadable no matter how
 * much room the window has. Only grids and tables take up the extra space.
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
      {/* Translucent + blurred rather than solid: content scrolling under the
          header stays faintly visible, which is what makes a sticky bar read as
          a layer instead of a lid. */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link
              href="/teacher"
              aria-label="Evalio home"
              className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Brand />
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
              <NavLink href="/teacher" exact>
                Dashboard
              </NavLink>
              <NavLink href="/teacher/classes">Classes</NavLink>
              <NavLink href="/teacher/analytics">Statistics</NavLink>
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
                className="pressable rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="page-enter mx-auto w-full max-w-7xl flex-1 space-y-10 px-4 py-10 md:px-6">
        {children}
      </main>
    </div>
  );
}
