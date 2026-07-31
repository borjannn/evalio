"""Populate the database at realistic volume: tens of quizzes, hundreds of attempts.

`seed_demo` builds a small, hand-placed dataset where every row exists to make one
screen legible. This builds the other thing — enough data that pagination, the
statistics groupings and the distribution charts have something to show. Use
`seed_demo` to look at a feature, this to look at how it behaves under load.

    python manage.py seed_bulk
    python manage.py seed_bulk --flush            # remove a previous bulk run first
    python manage.py seed_bulk --scale 0.3        # a third of the attempts, for a quick loop
    python manage.py seed_bulk --seed 7           # a different but reproducible dataset

⚠️ **This is not a Django fixture, and the content JSON must not be given to
`loaddata`.** `loaddata` deserializes with `save_base(raw=True)`, which bypasses
model `save()` overrides — and `AnswerResponse.save()` is what derives
`is_correct` and writes the `question_text` / `choice_text` /
`choice_feedback_text` snapshots. A fixture of answers would load without
complaint and produce rows with empty snapshots and every answer marked wrong:
every score zero, every feedback passage empty, the whole statistics screen
quietly false. `FeedbackResult` has the same problem — it is assembled by
`feedback.services.generate_feedback`, not written by hand.

So the split is: JSON holds what a person authored (topics, banks, questions,
quiz outlines, classes), and everything derived is built here through the ORM.

Every account created carries `@bulk.evalio.test` in its email, which is what
`--flush` matches on. Everything else hangs off those users by a CASCADE, so
deleting them removes the whole run and nothing else — including the `seed_demo`
accounts, which use a different domain.
"""

import json
import random
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from attempts.models import AnswerResponse, QuizAttempt
from classes.models import Class, Enrollment, GroupMembership, QuizAssignment, TeachingGroup
from feedback.services import generate_feedback
from quizzes.models import Choice, Question, QuestionBank, Quiz, QuizQuestion, Topic

User = get_user_model()

DEFAULT_SPEC = Path(settings.BASE_DIR) / "seed_data" / "bulk.json"

# How far back attempts are spread. The screens don't chart anything against time
# yet, but "Started" columns full of identical timestamps look broken.
HISTORY_DAYS = 120

# Fractions, all deliberately not round numbers — a dataset where every quiz has
# exactly the same participation rate produces suspiciously tidy statistics.
ATTEMPT_RATE = 0.72          # of the students a quiz reaches, how many start it
ABANDON_RATE = 0.06          # of those, how many are still in progress
SKIP_RATE = 0.04             # per question, left unanswered
TOP_DISTRACTOR_WEIGHT = 0.55  # share of wrong answers going to the first wrong choice

# Chance of a correct answer for an average student on an average question. The
# two difficulty numbers in the spec are on **different scales** and mixing them
# up is what made the first run score everyone at 12%: a question's `difficulty`
# is absolute, 0-1 around a midpoint of 0.5, while a quiz's is a signed offset
# around 0. `question_difficulty_midpoint` is what re-centres the first one.
BASE_CORRECT_CHANCE = 0.68
QUESTION_DIFFICULTY_MIDPOINT = 0.5
# Never certain either way — a question nobody ever gets wrong has no distractor
# breakdown to show, and one nobody ever gets right has no correct bar.
CHANCE_FLOOR = 0.05
CHANCE_CEILING = 0.95


class Command(BaseCommand):
    help = "Populate the database at volume: tens of quizzes, hundreds of attempts."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete data from a previous seed_bulk run before seeding.",
        )
        parser.add_argument(
            "--spec",
            default=str(DEFAULT_SPEC),
            help=f"Content JSON to build from. Default: {DEFAULT_SPEC}",
        )
        parser.add_argument(
            "--seed",
            type=int,
            default=20260731,
            help="RNG seed. The same seed always produces the same dataset.",
        )
        parser.add_argument(
            "--scale",
            type=float,
            default=1.0,
            help="Multiplier on the attempt rate, 0-1. Use ~0.3 for a fast rebuild.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        spec_path = Path(options["spec"])
        if not spec_path.exists():
            raise CommandError(f"No spec at {spec_path}.")

        self.spec = json.loads(spec_path.read_text(encoding="utf-8"))
        self.domain = self.spec["email_domain"]
        # Seeded rather than global `random`: a reproducible dataset means a
        # screenshot, a bug report and a "works on my machine" all refer to the
        # same numbers.
        self.rng = random.Random(options["seed"])
        self.attempt_rate = ATTEMPT_RATE * max(0.0, min(1.0, options["scale"]))

        if options["flush"]:
            self.flush()

        if User.objects.filter(email__endswith=f"@{self.domain}").exists():
            raise CommandError(
                "Bulk data already exists. Re-run with --flush to replace it."
            )

        teachers = self.create_teachers()
        students = self.create_students()
        topics = self.create_content(teachers)
        classes = self.create_classes(teachers, students, topics)
        self.create_assignments(topics, classes, students)
        counts = self.create_attempts(topics, classes)

        self.report(teachers, students, topics, classes, counts)

    # ------------------------------------------------------------------ flush

    def flush(self):
        deleted, _ = User.objects.filter(email__endswith=f"@{self.domain}").delete()
        self.stdout.write(f"Flushed previous bulk data ({deleted} rows).")

    # ------------------------------------------------------------------ users

    def _password(self):
        """Hash once, reuse everywhere.

        `create_user` hashes per call, and PBKDF2 is deliberately slow — at ~180
        accounts that alone was most of the command's runtime. The hash does not
        depend on the user, so there is nothing to gain from repeating it.
        """
        if not hasattr(self, "_hashed"):
            self._hashed = make_password(self.spec["password"])
        return self._hashed

    def create_teachers(self):
        teachers = {}
        for entry in self.spec["teachers"]:
            teachers[entry["username"]] = User(
                username=entry["username"],
                email=f"{entry['username']}@{self.domain}",
                first_name=entry["first_name"],
                last_name=entry["last_name"],
                role=User.Role.TEACHER,
                password=self._password(),
            )
        User.objects.bulk_create(teachers.values())
        return teachers

    def create_students(self):
        """One student per (first, last) pair the spec offers, with an ability score.

        `ability` is what makes the statistics worth looking at. Everyone answering
        at the same rate produces a single spike in the distribution chart and
        identical class means; drawing it from a normal distribution gives the
        histogram a shape, the classes an ordering, and the "spread" column
        something to say.
        """
        firsts = self.spec["student_first_names"]
        lasts = self.spec["student_last_names"]

        taken = set(User.objects.values_list("username", flat=True))
        students = []
        pending = []

        for last in lasts:
            for first in firsts:
                username = f"{first[0]}{last}".lower()
                suffix = 1
                candidate = username
                while candidate in taken:
                    suffix += 1
                    candidate = f"{username}{suffix}"
                taken.add(candidate)

                pending.append(
                    User(
                        username=candidate,
                        email=f"{candidate}@{self.domain}",
                        first_name=first,
                        # Bulgarian surnames take an -a for women. Cosmetic, but a
                        # roster where every woman has a man's surname reads wrong.
                        last_name=last + "a" if first.endswith("a") else last,
                        role=User.Role.STUDENT,
                        password=self._password(),
                    )
                )

        created = User.objects.bulk_create(pending)
        for user in created:
            students.append(
                {
                    "user": user,
                    # Clipped rather than unbounded: a student three deviations out
                    # would answer every question right or wrong and flatten into a
                    # meaningless row.
                    "ability": max(-0.35, min(0.4, self.rng.gauss(0.05, 0.18))),
                }
            )
        return students

    # ---------------------------------------------------------------- content

    def create_content(self, teachers):
        topics = []

        for topic_spec in self.spec["topics"]:
            teacher = teachers[topic_spec["teacher"]]
            topic = Topic.objects.create(
                name=topic_spec["name"],
                description=topic_spec["description"],
                created_by=teacher,
            )
            # Mirrors TopicViewSet.perform_create, which always makes a default bank.
            QuestionBank.objects.create(topic=topic, name=QuestionBank.DEFAULT_NAME)

            pool = []
            for bank_spec in topic_spec["banks"]:
                bank = QuestionBank.objects.create(topic=topic, name=bank_spec["name"])
                pool.extend(self.build_questions(bank, teacher, bank_spec["questions"]))

            quizzes = self.build_quizzes(topic, teacher, topic_spec["quizzes"], pool)
            topics.append({"topic": topic, "teacher": teacher, "quizzes": quizzes})

        return topics

    def build_questions(self, bank, teacher, specs):
        """Questions and choices in two bulk inserts per bank.

        `bulk_create` is safe here and *not* safe for answers: neither `Question`
        nor `Choice` overrides `save()`, so there is no derivation to skip.
        `AnswerResponse` does, which is why `answer()` below saves one at a time.
        """
        questions = Question.objects.bulk_create(
            [
                Question(
                    question_bank=bank,
                    text=spec["text"],
                    question_type=spec.get("type", "mc"),
                    created_by=teacher,
                )
                for spec in specs
            ]
        )

        choices = []
        for question, spec in zip(questions, specs, strict=True):
            for text, is_correct, feedback in spec["choices"]:
                choices.append(
                    Choice(
                        question=question,
                        text=text,
                        is_correct=is_correct,
                        feedback_text=feedback,
                    )
                )
        Choice.objects.bulk_create(choices)

        by_question = {}
        for choice in Choice.objects.filter(question__in=questions):
            by_question.setdefault(choice.question_id, []).append(choice)

        pool = []
        for question, spec in zip(questions, specs, strict=True):
            options = by_question[question.pk]
            correct = next(c for c in options if c.is_correct)
            # Order matters: the JSON lists the most tempting wrong answer first,
            # and `answer()` weights it. That is what gives the statistics screen's
            # choice breakdown a dominant distractor to find instead of an even
            # scatter across the wrong options.
            wrong = [c for c in options if not c.is_correct]
            pool.append(
                {
                    "question": question,
                    "correct": correct,
                    "wrong": wrong,
                    "difficulty": spec.get("difficulty", 0.5),
                }
            )
        return pool

    def build_quizzes(self, topic, teacher, specs, pool):
        quizzes = []
        for spec in specs:
            quiz = Quiz.objects.create(
                topic=topic,
                title=spec["title"],
                description=spec.get("description", ""),
                is_published=spec.get("published", True),
                created_by=teacher,
            )
            # Sampled from the topic's whole pool, so quizzes deliberately overlap.
            # That overlap is the point: a question shared by three quizzes is what
            # proves the analytics keys per (quiz, question) rather than pooling.
            size = min(spec["questions"], len(pool))
            chosen = self.rng.sample(pool, size)
            QuizQuestion.objects.bulk_create(
                [
                    QuizQuestion(quiz=quiz, question=item["question"], order=index)
                    for index, item in enumerate(chosen)
                ]
            )
            quizzes.append(
                {
                    "quiz": quiz,
                    "questions": chosen,
                    "difficulty": spec.get("difficulty", 0.0),
                }
            )
        return quizzes

    # ---------------------------------------------------------------- classes

    def create_classes(self, teachers, students, topics):
        classes = []
        cursor = 0
        pool = [entry for entry in students]

        for class_spec in self.spec["classes"]:
            teacher = teachers[class_spec["teacher"]]
            school_class = Class.objects.create(
                name=class_spec["name"],
                school_year=class_spec["school_year"],
                created_by=teacher,
            )

            size = class_spec["students"]
            members = pool[cursor:cursor + size]
            cursor += size
            if len(members) < size:
                # Wrap rather than run short. A student in two classes is a real
                # case the analytics has to handle — their attempt counts towards
                # both class means, which is correct and easy to mistake for a bug.
                members += pool[: size - len(members)]

            enrollments = Enrollment.objects.bulk_create(
                [
                    Enrollment(student=entry["user"], school_class=school_class)
                    for entry in members
                ]
            )

            groups = self.create_groups(school_class, teacher, topics, enrollments)
            classes.append(
                {
                    "class": school_class,
                    "teacher": teacher,
                    "members": members,
                    "enrollments": enrollments,
                    "groups": groups,
                }
            )

        return classes

    def create_groups(self, school_class, teacher, topics, enrollments):
        """One subject group per class, over a strict subset of the roster.

        Strict subset on purpose: a group whose members are the whole class is
        indistinguishable from the class itself, and then nothing on the assign
        screen or in the group statistics can be told apart.
        """
        candidates = [t for t in topics if t["teacher"] == teacher]
        if not candidates:
            return []

        topic = self.rng.choice(candidates)["topic"]
        group = TeachingGroup.objects.create(
            school_class=school_class, topic=topic, teacher=teacher
        )
        subset = self.rng.sample(enrollments, max(2, len(enrollments) * 2 // 3))
        GroupMembership.objects.bulk_create(
            [GroupMembership(group=group, enrollment=enrollment) for enrollment in subset]
        )
        return [{"group": group, "enrollments": subset}]

    # ------------------------------------------------------------ assignments

    def create_assignments(self, topics, classes, students):
        """Spread each quiz over one to three targets, using all three target types.

        The constraint that exactly one of class/group/student is set is enforced
        by a database CheckConstraint, and the partial unique indexes stop the same
        quiz being assigned to the same class twice — so the sampling below picks
        distinct targets rather than relying on the database to forgive it.
        """
        for topic in topics:
            teacher = topic["teacher"]
            own_classes = [c for c in classes if c["teacher"] == teacher]
            if not own_classes:
                continue

            for entry in topic["quizzes"]:
                quiz = entry["quiz"]
                picks = self.rng.sample(
                    own_classes, min(len(own_classes), self.rng.randint(1, 3))
                )

                for school_class in picks:
                    # Occasionally target the class's group instead of the class,
                    # so group-scoped statistics have real cohorts behind them.
                    groups = school_class["groups"]
                    if groups and self.rng.random() < 0.3:
                        QuizAssignment.objects.create(
                            quiz=quiz, group=groups[0]["group"], assigned_by=teacher
                        )
                    else:
                        QuizAssignment.objects.create(
                            quiz=quiz,
                            school_class=school_class["class"],
                            assigned_by=teacher,
                        )

                # A named individual now and then. Picked from a class this teacher
                # already has, so it is a plausible "catch-up" assignment rather
                # than a student they could not otherwise see.
                if self.rng.random() < 0.25:
                    source = self.rng.choice(own_classes)
                    student = self.rng.choice(source["members"])["user"]
                    already = QuizAssignment.objects.filter(
                        quiz=quiz, student=student
                    ).exists()
                    if not already:
                        QuizAssignment.objects.create(
                            quiz=quiz, student=student, assigned_by=teacher
                        )

    # --------------------------------------------------------------- attempts

    def audience_for(self, quiz, classes):
        """Everyone the quiz's assignments reach, deduplicated.

        Deliberately recomputed from the assignment rows rather than remembered
        from `create_assignments`: this is the same question
        `classes/selectors.py::assignment_audience` answers, and building the
        attempts from a *different* idea of who was assigned would produce a
        dataset where the results screen disagrees with itself.
        """
        by_user = {}
        assignments = QuizAssignment.objects.filter(quiz=quiz).select_related(
            "school_class", "group", "student"
        )

        for assignment in assignments:
            if assignment.school_class_id:
                entry = next(
                    c for c in classes if c["class"].pk == assignment.school_class_id
                )
                for member in entry["members"]:
                    by_user[member["user"].pk] = member
            elif assignment.group_id:
                for entry in classes:
                    for group in entry["groups"]:
                        if group["group"].pk != assignment.group_id:
                            continue
                        ids = {e.student_id for e in group["enrollments"]}
                        for member in entry["members"]:
                            if member["user"].pk in ids:
                                by_user[member["user"].pk] = member
            elif assignment.student_id:
                for entry in classes:
                    for member in entry["members"]:
                        if member["user"].pk == assignment.student_id:
                            by_user[member["user"].pk] = member

        return list(by_user.values())

    def answer(self, attempt, item, correct):
        """One answer, saved individually so `AnswerResponse.save()` runs.

        ⚠️ Do not "optimise" this into `bulk_create`. `save()` is what copies
        `is_correct` and the question/choice/explanation snapshots onto the row;
        `bulk_create` skips it, and the result is a database full of answers that
        look fine in the admin and score zero everywhere else.
        """
        if correct:
            choice = item["correct"]
        else:
            wrong = item["wrong"]
            if not wrong:
                return
            # Weighted towards the first wrong choice, which the JSON lists as the
            # most tempting one. An even scatter would make every question's choice
            # breakdown look the same and say nothing.
            if len(wrong) == 1 or self.rng.random() < TOP_DISTRACTOR_WEIGHT:
                choice = wrong[0]
            else:
                choice = self.rng.choice(wrong[1:])

        response = AnswerResponse(attempt=attempt, question=item["question"])
        response.selected_choice = choice
        response.save()

    def create_attempts(self, topics, classes):
        submitted = 0
        in_progress = 0
        answers = 0
        timestamps = []

        for topic in topics:
            for entry in topic["quizzes"]:
                quiz = entry["quiz"]
                # Drafts are invisible to students — `quizzes_assigned_to` filters
                # on `is_published` — so an attempt at one could not have happened.
                # Leaving them at zero is also what makes the "assigned but never
                # sat" row on the topic screen real rather than contrived.
                if not quiz.is_published:
                    continue

                for member in self.audience_for(quiz, classes):
                    if self.rng.random() > self.attempt_rate:
                        continue

                    attempt = QuizAttempt.objects.create(
                        student=member["user"], quiz=quiz
                    )
                    started = timezone.now() - timedelta(
                        days=self.rng.uniform(1, HISTORY_DAYS),
                        minutes=self.rng.uniform(0, 600),
                    )

                    if self.rng.random() < ABANDON_RATE:
                        # Started and never finished. No feedback, no score, and
                        # excluded from every statistic — which is the case the
                        # submitted-only attempt counts exist to get right.
                        in_progress += 1
                        timestamps.append((attempt, started, None))
                        continue

                    for item in entry["questions"]:
                        if self.rng.random() < SKIP_RATE:
                            continue  # unanswered: counts as wrong, explains nothing
                        chance = (
                            BASE_CORRECT_CHANCE
                            + member["ability"]
                            - (item["difficulty"] - QUESTION_DIFFICULTY_MIDPOINT)
                            - entry["difficulty"]
                        )
                        chance = max(CHANCE_FLOOR, min(CHANCE_CEILING, chance))
                        self.answer(attempt, item, correct=self.rng.random() < chance)
                        answers += 1

                    attempt.submitted_at = started + timedelta(
                        minutes=self.rng.uniform(4, 26)
                    )
                    attempt.save()
                    generate_feedback(attempt)

                    submitted += 1
                    timestamps.append((attempt, started, attempt.submitted_at))

        self.backdate(timestamps)
        return {"submitted": submitted, "in_progress": in_progress, "answers": answers}

    def backdate(self, timestamps):
        """Spread `started_at` over the last few months.

        `started_at` is `auto_now_add`, so it cannot be set on create — every row
        would otherwise carry the moment the command ran, and the results screen's
        "Started" column would be a wall of today's date.

        `bulk_update` rather than a save loop: it builds one UPDATE per batch and,
        unlike `save()`, takes the in-memory value without running `pre_save`,
        which is exactly what lets an `auto_now_add` field be rewritten at all.
        """
        for attempt, started, submitted_at in timestamps:
            attempt.started_at = started
            attempt.submitted_at = submitted_at

        QuizAttempt.objects.bulk_update(
            [row[0] for row in timestamps], ["started_at", "submitted_at"], batch_size=500
        )

    # ----------------------------------------------------------------- report

    def report(self, teachers, students, topics, classes, counts):
        quizzes = sum(len(t["quizzes"]) for t in topics)
        questions = Question.objects.filter(
            question_bank__topic__created_by__in=teachers.values()
        ).count()

        self.stdout.write(self.style.SUCCESS("\nBulk dataset created.\n"))
        self.stdout.write(f"  Teachers          {len(teachers)}")
        self.stdout.write(f"  Students          {len(students)}")
        self.stdout.write(f"  Classes           {len(classes)}")
        self.stdout.write(f"  Topics            {len(topics)}")
        self.stdout.write(f"  Questions         {questions}")
        self.stdout.write(f"  Quizzes           {quizzes}")
        self.stdout.write(f"  Assignments       {QuizAssignment.objects.count()}")
        self.stdout.write(f"  Attempts          {counts['submitted']} submitted, "
                          f"{counts['in_progress']} in progress")
        self.stdout.write(f"  Answers           {counts['answers']}")

        self.stdout.write("\n  Sign in as a teacher to see it:")
        for entry in self.spec["teachers"]:
            marker = "  (most of the content)" if entry.get("primary") else ""
            self.stdout.write(
                f"    {entry['username']} / {self.spec['password']}{marker}"
            )
        self.stdout.write(
            "\n  Every account uses the password above. "
            "Remove the run with: manage.py seed_bulk --flush\n"
        )
