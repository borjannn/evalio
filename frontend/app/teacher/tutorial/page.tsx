import {
  BarChart3,
  BookOpen,
  ClipboardList,
  FileJson,
  Layers,
  Lightbulb,
  PenLine,
  Send,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { PageHeader, Section } from "@/components/ui/section";
import { TutorialStep, TutorialSteps } from "@/components/tutorial-step";
import { requireTeacher } from "@/lib/auth";

/**
 * A static how-to for the teacher side — no data, so no `apiGet` and no
 * pagination. It still calls `requireTeacher()` first (docs/FRONTEND.md §11): a
 * layout guard does not re-run on client-side navigation, so every page carries
 * its own check.
 *
 * The content tracks the real flows in docs/FRONTEND.md §7–8; when a screen
 * changes, this page is part of the same change.
 */
export const metadata = { title: "How Evalio works — Evalio" };

export default async function TeacherTutorial() {
  await requireTeacher();

  return (
    <div className="space-y-10">
      <PageHeader
        title="How Evalio works"
        description="A quick tour of the teacher side — from building a question bank to reading the class's results."
      />

      <Section
        title="The shape of it"
        description="Three things stack up, each holding the next. Getting this order right is the whole workflow."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardBody className="space-y-2 p-6">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <BookOpen size={18} />
              </span>
              <h3 className="font-semibold">Topics</h3>
              <p className="text-sm text-muted-foreground">
                A subject you teach — &ldquo;Year 9 Biology&rdquo;. It holds your
                question banks and your quizzes.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-2 p-6">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Layers size={18} />
              </span>
              <h3 className="font-semibold">Question banks</h3>
              <p className="text-sm text-muted-foreground">
                Reusable questions inside a topic. Write a question once, use it in
                any number of quizzes.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-2 p-6">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <ClipboardList size={18} />
              </span>
              <h3 className="font-semibold">Quizzes</h3>
              <p className="text-sm text-muted-foreground">
                An ordered selection of questions you assign to a class, a group,
                or a single student.
              </p>
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section title="Building your first quiz">
        <TutorialSteps>
          <TutorialStep n={1} title="Create a topic" icon={BookOpen}>
            <p>
              From the <strong>Dashboard</strong>, use <strong>New topic</strong>.
              This is the folder everything else lives in — give it the name of the
              subject or unit you&rsquo;re teaching.
            </p>
          </TutorialStep>

          <TutorialStep n={2} title="Fill a question bank" icon={Layers}>
            <p>
              Open the topic, go to its <strong>banks</strong>, and add questions.
              Each question has its choices, and you mark which one is correct.
            </p>
            <p>
              For every <strong>wrong </strong>choice, write a short explanation of
              why it&rsquo;s wrong — this is what a student sees as feedback if they
              pick it. The correct choice needs no explanation.
            </p>
          </TutorialStep>

          <TutorialStep n={3} title="Assemble the quiz" icon={ClipboardList}>
            <p>
              Back in the topic, create a quiz and open the{" "}
              <strong>builder</strong>. There are three ways to add questions, as
              tabs in one panel:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <strong>Write a question</strong>{" "}— type one from scratch.
              </li>
              <li>
                <strong>Add from a bank</strong>{" "}— pull in questions you&rsquo;ve
                already written.
              </li>
              <li>
                <strong>Import JSON</strong>{" "}<FileJson size={13} className="inline" />{" "}
                — paste a block of questions (your own, or from an LLM). The panel
                shows the exact format and has a <em>Copy a format</em> button.
              </li>
            </ul>
            <p>
              Drag the questions by the grip to set the order — that&rsquo;s the
              exact sequence a student will see.
            </p>
          </TutorialStep>

          <TutorialStep n={4} title="Publish" icon={Send}>
            <p>
              A quiz starts as a <strong>Draft</strong>, invisible to students. Hit{" "}
              <strong>Publish</strong>{" "}when it&rsquo;s ready. You can still edit a
              published quiz — answers are snapshotted when a student submits, so
              your edits never rewrite work they&rsquo;ve already done.
            </p>
          </TutorialStep>
        </TutorialSteps>
      </Section>

      <Section
        title="Feedback, and the AI drafting"
        description="Feedback is stitched together from those per-choice explanations — a student gets a passage covering every answer they got wrong."
      >
        <TutorialSteps>
          <TutorialStep n={1} title="Set the voice (optional)" icon={Lightbulb}>
            <p>
              On a topic you can write <strong>drafting instructions</strong> — the
              tone and style you want explanations written in. Every quiz in the
              topic inherits it.
            </p>
          </TutorialStep>

          <TutorialStep n={2} title="Draft explanations with Suggest" icon={Sparkles}>
            <p>
              In the question form, <strong>Suggest</strong> drafts an explanation
              for a wrong choice. Drafts land in a separate field and are always{" "}
              <strong>marked as AI-drafted</strong>{" "}until you edit them — at which
              point they become your words. The AI never touches text you&rsquo;ve
              written and never explains the correct answer.
            </p>
            <p>
              The builder&rsquo;s feedback panel counts them honestly —{" "}
              <strong>&ldquo;5 yours · 29 drafted · 2 missing&rdquo;</strong>{" "}— and
              can bulk-draft a whole quiz.
            </p>
          </TutorialStep>

          <TutorialStep n={3} title="Choose which version students see" icon={PenLine}>
            <p>
              The <strong>feedback mode</strong> switch decides whether students get
              your written explanations only, or your written ones with AI drafts
              filling the gaps. The switch states its consequence in words, because
              it can affect students who have already submitted.
            </p>
          </TutorialStep>
        </TutorialSteps>
      </Section>

      <Section
        title="Classes, and who gets the quiz"
        description="Assignment is what makes a quiz appear on a student's home screen."
      >
        <TutorialSteps>
          <TutorialStep n={1} title="Build a class roster" icon={Users}>
            <p>
              Under <strong>Classes</strong>, create a class and enrol students by
              their <strong>exact username</strong> with <strong>Invite</strong>.
              You can also carve a class into smaller <strong>groups</strong> — a
              subject set, say — with a checkbox per student.
            </p>
          </TutorialStep>

          <TutorialStep n={2} title="Assign the quiz" icon={Send}>
            <p>
              From the quiz, open <strong>Assign</strong>. You can target a whole{" "}
              <strong>class</strong>, a <strong>group</strong>, or an{" "}
              <strong>individual student</strong>. A student reached by more than one
              route still sees the quiz once.
            </p>
          </TutorialStep>

          <TutorialStep n={3} title="Read the results" icon={BarChart3}>
            <p>
              A quiz&rsquo;s <strong>Results</strong> shows every assigned
              student&rsquo;s score, including those who never started, and lets you
              open any attempt to see exactly what they answered.
            </p>
            <p>
              The <strong>Statistics</strong> screen slices all of it — by class,
              topic, quiz and more — with the mean, median, range and the shape of
              the distribution, so a class that&rsquo;s split cleanly reads
              differently from one that&rsquo;s evenly middling.
            </p>
          </TutorialStep>
        </TutorialSteps>
      </Section>

      <Section title="The one promise the app keeps for you">
        <Card>
          <CardBody className="flex gap-4 p-6">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Shield size={18} />
            </span>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                Students never see the answer key.
              </p>
              <p>
                Which choice is correct, and your explanations of the wrong ones,
                are withheld from every student screen until the moment they submit.
                Answering a question doesn&rsquo;t even tell them whether they got it
                right. This is enforced on the server, not just hidden in the
                interface — so you can write frank explanations without worrying
                they&rsquo;ll leak.
              </p>
            </div>
          </CardBody>
        </Card>
      </Section>
    </div>
  );
}
