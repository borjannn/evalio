"""Print AI-drafted feedback for a quiz's questions without going near a student.

This is the tuning loop. The prompt in `feedback/prompts.py` is the only thing that
decides whether this feature is any good, and nothing downstream depends on its
wording — so the order of work is: run this, read the output, edit the template,
run it again. Only once the text is right does any of it matter.

    python manage.py draft_feedback --quiz 3 --limit 3          # 3 calls, writes nothing
    python manage.py draft_feedback --quiz 3 --fake             # 0 calls, checks the plumbing
    python manage.py draft_feedback --quiz 3 --write            # fills the gaps for real

**Writes nothing unless `--write` is passed.** `--limit` exists because a free-tier
key is metered per day and the whole point of a tuning run is to read three
explanations, not forty.
"""

import textwrap

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from feedback.providers import ProviderUnavailable
from feedback.suggestions import generate_for_quiz, questions_for_dry_run, run_jobs
from quizzes.models import Quiz


class Command(BaseCommand):
    help = "Draft per-choice feedback for a quiz's questions and print the results."

    def add_arguments(self, parser):
        parser.add_argument("--quiz", type=int, required=True, help="Quiz id.")
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Only draft the first N questions. One API call each.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print without writing. This is the default; the flag is accepted for clarity.",
        )
        parser.add_argument(
            "--write",
            action="store_true",
            help="Actually fill the quiz's blank wrong choices, like the bulk endpoint does.",
        )
        parser.add_argument(
            "--fake",
            action="store_true",
            help="Use the deterministic fake provider. Exercises everything, spends nothing.",
        )

    def handle(self, *args, **options):
        try:
            quiz = Quiz.objects.select_related("topic").get(pk=options["quiz"])
        except Quiz.DoesNotExist:
            raise CommandError(f"No quiz with id {options['quiz']}.") from None

        if options["fake"]:
            settings.AI_FEEDBACK_PROVIDER = "feedback.providers.base.FakeProvider"
            settings.AI_FEEDBACK_ENABLED = True
            self.stdout.write(self.style.WARNING("Using the fake provider — no API calls.\n"))

        self.stdout.write(f"Quiz:  {quiz.title}")
        self.stdout.write(f"Topic: {quiz.topic.name}")
        prompt = quiz.topic.feedback_prompt.strip()
        self.stdout.write(
            f"Topic prompt: {prompt if prompt else '(none - using the built-in template alone)'}"
        )
        self.stdout.write(f"Provider: {settings.AI_FEEDBACK_PROVIDER}\n")

        if options["write"]:
            return self._write(quiz)
        return self._dry_run(quiz, options["limit"])

    def _dry_run(self, quiz, limit):
        jobs = questions_for_dry_run(quiz, limit=limit)
        if not jobs:
            self.stdout.write(self.style.WARNING("This quiz has no questions with wrong choices."))
            return

        self.stdout.write(f"Drafting {len(jobs)} question(s) = {len(jobs)} API call(s).\n")
        try:
            drafts = run_jobs(jobs, topic=quiz.topic, quiz=quiz)
        except ProviderUnavailable as exc:
            raise CommandError(str(exc)) from None

        choices_by_id = {
            choice.id: choice for _, choices, _ in jobs for choice in choices
        }

        for (question, _, _), draft in zip(jobs, drafts, strict=True):
            self.stdout.write(self.style.MIGRATE_HEADING(f"\n{question.text}"))
            if not draft.ok:
                self.stdout.write(self.style.ERROR(f"  FAILED: {draft.error}"))
                continue
            for choice_id, text in draft.suggestions.items():
                choice = choices_by_id[choice_id]
                # ASCII only. The Windows console is cp1252 and raises
                # UnicodeEncodeError on the tick and cross glyphs.
                self.stdout.write(f"  [wrong] {choice.text}")
                for line in textwrap.wrap(text, width=76):
                    self.stdout.write(f"      {line}")
                existing = choice.feedback_text.strip()
                if existing:
                    self.stdout.write(
                        self.style.WARNING(
                            "      (teacher text exists - a real run would skip this choice)"
                        )
                    )
                self.stdout.write("")

        self.stdout.write(self.style.SUCCESS("\nNothing was written. Pass --write to fill gaps."))

    def _write(self, quiz):
        try:
            result = generate_for_quiz(quiz)
        except ProviderUnavailable as exc:
            raise CommandError(str(exc)) from None

        self.stdout.write(self.style.SUCCESS(f"Wrote {result.generated} explanation(s)."))
        self.stdout.write(f"Skipped (teacher-written): {result.skipped_teacher_written}")
        self.stdout.write(f"Remaining gaps: {result.remaining_gaps}")
        for failure in result.failures:
            self.stdout.write(
                self.style.ERROR(f"  question {failure['question_id']}: {failure['reason']}")
            )
