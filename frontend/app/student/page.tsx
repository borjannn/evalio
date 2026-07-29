import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions";
import { requireStudent } from "@/lib/auth";

/** Stub. Phase 7 replaces this with the assigned-quiz list. */
export default async function StudentHome() {
  const user = await requireStudent();

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4 md:p-8">
      <h1 className="text-3xl font-semibold tracking-tight">
        Signed in as {user.first_name || user.username}
      </h1>
      <p className="text-muted-foreground">
        Student home — not built yet (Phase 7).
      </p>
      <form action={logout}>
        <Button variant="secondary" type="submit">
          Sign out
        </Button>
      </form>
    </main>
  );
}
