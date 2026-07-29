import { BookOpen, Layers, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";

/**
 * Phase 1 verification page — renders every token and every shared primitive so
 * a change to the design system is visible in one place.
 *
 * Phase 2 replaces this file with the role redirect: read `GET /api/auth/me/`,
 * send teachers to /teacher and students to /student.
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
