import { BookOpen, Layers, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PageLoader, Skeleton } from "@/components/ui/loader";

import { ErrorPreview } from "./error-preview";

/**
 * Internal reference — renders every token and every shared primitive so a
 * change to the design system is visible in one place.
 *
 * Not part of the product and not linked from anywhere. It earns its keep while
 * the remaining screens are built; delete it when they are done.
 */

export const metadata = { title: "Design system — Evalio" };

// The hexes are labels, not the source of truth — @theme in globals.css is.
// Keep them in step with it; a swatch board that lies is worse than none.
const swatches = [
  { name: "background", className: "bg-background", hex: "#ffffff" },
  { name: "secondary", className: "bg-secondary", hex: "#f1f5f9" },
  { name: "muted", className: "bg-muted", hex: "#e2e8f0" },
  { name: "foreground", className: "bg-foreground", hex: "#0f172a" },
  { name: "muted-foreground", className: "bg-muted-foreground", hex: "#64748b" },
  { name: "primary", className: "bg-primary", hex: "#2563eb" },
  { name: "accent", className: "bg-accent", hex: "#2563eb" },
  { name: "border", className: "bg-border", hex: "#dbe2ea" },
  { name: "ring", className: "bg-ring", hex: "#2563eb" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardBody className="space-y-4 p-6">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {children}
      </CardBody>
    </Card>
  );
}

export default function DesignSystemCheck() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Design system</h1>
        <p className="mt-1 text-muted-foreground">
          Phase 1 smoke test. Replaced by the role redirect in Phase 2.
        </p>
      </div>

      <Section title="Type scale">
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
      </Section>

      <Section title="Colour">
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
      </Section>

      <Section title="Buttons">
        <p className="text-sm text-muted-foreground">
          Tab through these — every focus ring is grey (<code className="font-mono">--color-ring</code>),
          per Guidelines §6.2.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button>
            <Plus size={16} />
            Primary
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Form">
        <div className="max-w-sm space-y-4">
          <Field htmlFor="demo-name" label="Topic name">
            <Input id="demo-name" name="name" placeholder="e.g. Physics 101" />
          </Field>
          <Field
            htmlFor="demo-desc"
            label="Description"
            hint="Shown under the title on the topic card."
          >
            <Textarea id="demo-desc" name="description" rows={3} />
          </Field>
          <Field htmlFor="demo-err" label="With an error" error="This field is required.">
            <Input id="demo-err" name="broken" aria-invalid />
          </Field>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>
            <BookOpen size={14} />4 Quizzes
          </Badge>
          <Badge>
            <Layers size={14} />
            12 Banks
          </Badge>
          <Badge tone="success">Correct</Badge>
          <Badge tone="danger">Incorrect</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          The success and danger tones are teacher-only — colour coding a choice on a student screen
          before submission breaks the core content rule.
        </p>
      </Section>

      <Section title="Empty state">
        <EmptyState
          icon={BookOpen}
          title="No topics yet"
          description="Create your first topic to start building quizzes and question banks."
          action={
            <Button>
              <Plus size={16} />
              Create Topic
            </Button>
          }
        />
      </Section>

      <Section title="Loading">
        <p className="text-sm text-muted-foreground">
          Skeletons where the layout is known, the tracing mark where it isn&apos;t. These are the
          only looping animations in the app, and the only ones that remove themselves.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
          <PageLoader label="Getting your quiz ready…" className="py-6" />
        </div>
      </Section>

      <Section title="Error">
        <p className="text-sm text-muted-foreground">
          The mark breaks in its own shape rather than falling back to a warning triangle. It jolts
          once and settles — an error stays on screen, so it must not loop.
        </p>
        <ErrorPreview />
      </Section>

      <Section title="Card footer">
        <Card>
          <CardBody>
            <h3 className="text-base font-medium">Mechanics</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              A card with a footer separated by the same 1px structural line.
            </p>
          </CardBody>
          <CardFooter>
            <Badge>3 Questions</Badge>
            <Badge>Draft</Badge>
          </CardFooter>
        </Card>
      </Section>
    </main>
  );
}
