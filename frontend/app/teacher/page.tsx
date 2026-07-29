import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions";
import { requireTeacher } from "@/lib/auth";

/**
 * Stub. Phase 3 replaces this with the topic dashboard.
 *
 * It exists now because `typedRoutes` checks every `<Link href>` against the
 * routes that actually exist — `homeFor()` and the login redirect both point
 * here, so the route has to be real before anything can link to it.
 */
export default async function TeacherHome() {
  const user = await requireTeacher();

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <h1 className="text-3xl font-semibold tracking-tight">
        Signed in as {user.first_name || user.username}
      </h1>
      <p className="text-muted-foreground">
        Teacher dashboard — not built yet (Phase 3).
      </p>
      {/* A plain form posting to a Server Function: no client component, and it
          works without JavaScript. Phase 3 moves this into the header. */}
      <form action={logout}>
        <Button variant="secondary" type="submit">
          Sign out
        </Button>
      </form>
    </main>
  );
}
