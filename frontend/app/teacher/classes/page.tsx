import { requireTeacher } from "@/lib/auth";

/** Stub. Phase 6 builds this (FRONTEND_PLAN §5.7–5.10). */
export const metadata = { title: "Classes — Evalio" };

export default async function ClassesPage() {
  await requireTeacher();

  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">Classes</h1>
      <p className="text-muted-foreground">Not built yet (Phase 6).</p>
    </div>
  );
}
