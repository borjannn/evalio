/**
 * Phase 0 verification page — proves every design token resolves and the two
 * fonts load. Phase 2 replaces this file with the role redirect (read
 * `GET /api/auth/me/`, send teachers to /teacher and students to /student).
 */

const swatches = [
  { name: "background", className: "bg-background", hex: "#ffffff" },
  { name: "secondary", className: "bg-secondary", hex: "#f5f5f5" },
  { name: "muted", className: "bg-muted", hex: "#e5e5e5" },
  { name: "foreground", className: "bg-foreground", hex: "#171717" },
  { name: "muted-foreground", className: "bg-muted-foreground", hex: "#737373" },
  { name: "accent", className: "bg-accent", hex: "#3b82f6" },
  { name: "border", className: "bg-border", hex: "#d4d4d4" },
  { name: "ring", className: "bg-ring", hex: "#a3a3a3" },
];

export default function TokenCheck() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Design tokens</h1>
        <p className="mt-1 text-muted-foreground">
          Phase 0 smoke test. Replaced by the role redirect in Phase 2.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-white p-6">
        <h2 className="text-lg font-semibold tracking-tight">Type scale</h2>
        <div className="space-y-3">
          <p className="text-3xl font-semibold tracking-tight">H1 — Page title, 30px</p>
          <p className="text-lg font-semibold tracking-tight">H2 — Section title, 18px</p>
          <p className="text-base font-medium">H3 — Subsection, 16px</p>
          <p className="text-sm">Body / default UI — 14px, dense for teacher views.</p>
          <p className="max-w-2xl text-base leading-relaxed">
            Feedback passage — 16px with relaxed leading, constrained to max-w-2xl so a line runs
            65–75 characters. This is the measure the student reading screens use.
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            Caption / badge — 12px Space Mono #1
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-white p-6">
        <h2 className="text-lg font-semibold tracking-tight">Colour</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {swatches.map((s) => (
            <div key={s.name} className="flex items-center gap-3">
              <div className={`size-10 shrink-0 rounded-md border border-border ${s.className}`} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{s.hex}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-white p-6">
        <h2 className="text-lg font-semibold tracking-tight">Controls</h2>
        <p className="text-sm text-muted-foreground">
          Tab through these — every focus ring must be grey (<code className="font-mono">--color-ring</code>),
          per Guidelines §6.2.
        </p>
        <div className="flex flex-wrap gap-3">
          <button className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Primary
          </button>
          <button className="rounded-md bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Secondary
          </button>
          <button className="rounded-md bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Destructive
          </button>
        </div>
        <div className="max-w-sm space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="sample">
            Input
          </label>
          <input
            id="sample"
            className="w-full rounded-md border border-border px-3 py-2 text-sm transition-colors focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            placeholder="Focus me"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-sm bg-secondary px-2 py-1 font-mono text-xs text-muted-foreground">
            4 Quizzes
          </span>
          <span className="inline-flex items-center rounded-sm bg-secondary px-2 py-1 font-mono text-xs text-muted-foreground">
            12 Banks
          </span>
        </div>
      </section>
    </main>
  );
}
