"""Populate the database with a realistic working dataset.

Most Evalio screens are meaningless against an empty database — the quiz builder,
the roster, and the results table all need existing rows to be worth looking at, and
the feedback passage only reads correctly when several wrong answers with real
explanations are stitched together.

Everything created here is owned by the demo accounts below, so `--flush` can remove
it precisely without touching anything else in the database.

    python manage.py seed_demo
    python manage.py seed_demo --flush     # delete previous demo data first
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from attempts.models import AnswerResponse, QuizAttempt
from classes.models import Class, Enrollment, GroupMembership, QuizAssignment, TeachingGroup
from feedback.services import generate_feedback
from quizzes.models import Choice, Question, QuestionBank, Quiz, QuizQuestion, Topic

User = get_user_model()

PASSWORD = "evalio123"

ADMIN = {"username": "admin", "email": "admin@evalio.test",
         "first_name": "Site", "last_name": "Admin"}

TEACHERS = [
    {"username": "mpetrova", "email": "m.petrova@evalio.test",
     "first_name": "Maria", "last_name": "Petrova"},
    {"username": "jstone", "email": "j.stone@evalio.test",
     "first_name": "James", "last_name": "Stone"},
]

STUDENTS = [
    ("aivanov", "Ana", "Ivanova"),
    ("bmarkov", "Boris", "Markov"),
    ("cnikolova", "Cveta", "Nikolova"),
    ("dgeorgiev", "Damyan", "Georgiev"),
    ("estoyanova", "Elena", "Stoyanova"),
    ("fdimitrov", "Filip", "Dimitrov"),
    ("gpetrov", "Georgi", "Petrov"),
    ("hkoleva", "Hristina", "Koleva"),
]

# (text, [(choice text, is_correct, feedback_text), ...])
# Only incorrect choices carry an explanation — that asymmetry is the reason the field
# is never exposed to students before they submit.
HARDWARE_IO = [
    (
        "What kind of device is a microphone?",
        [
            ("Input device", True, ""),
            ("Output device", False,
             "Output is wrong: a microphone captures sound rather than producing it."),
            ("Input/output device", False,
             "A microphone only captures; it has no output stage."),
            ("None of these", False,
             "A microphone is definitely a device of some kind."),
        ],
    ),
    (
        "What kind of device is a speaker?",
        [
            ("Output device", True, ""),
            ("Input device", False,
             "This reverses the direction: a speaker produces sound, it does not capture it."),
            ("Input/output device", False,
             "A speaker has no way of taking sound in."),
        ],
    ),
    (
        "What kind of device is a touchscreen?",
        [
            ("Input/output device", True, ""),
            ("Input device", False,
             "This misses half of it — a touchscreen also displays the image you are touching."),
            ("Output device", False,
             "This misses that a touchscreen receives your touch as well as showing a picture."),
        ],
    ),
    (
        "Which of these is an input device?",
        [
            ("Scanner", True, ""),
            ("Printer", False,
             "A printer takes data from the computer and puts it on paper, so it is an output device."),
            ("Monitor", False,
             "A monitor only displays what the computer sends it."),
            ("Projector", False,
             "A projector displays an image, so it works in the output direction."),
        ],
    ),
]

HARDWARE_STORAGE = [
    (
        "Which type of memory loses its contents when the computer is switched off?",
        [
            ("RAM", True, ""),
            ("ROM", False,
             "ROM keeps its contents without power — that is what read-only memory is for."),
            ("Hard disk", False,
             "A hard disk is exactly the opposite: it is designed to keep data without power."),
            ("SSD", False,
             "An SSD keeps data without power, which is why it can store your files."),
        ],
    ),
    (
        "Which unit is the largest?",
        [
            ("Gigabyte", True, ""),
            ("Megabyte", False,
             "A megabyte is a thousand times smaller than a gigabyte."),
            ("Kilobyte", False,
             "A kilobyte is the smallest of these — about one page of plain text."),
        ],
    ),
]

MATHS_FRACTIONS = [
    (
        "What is 1/2 + 1/4?",
        [
            ("3/4", True, ""),
            ("2/6", False,
             "Adding the tops and the bottoms separately does not work — the denominators have to "
             "match first."),
            ("1/6", False,
             "This subtracts instead of adding, and mishandles the denominator."),
            ("2/4", False,
             "This keeps only the first fraction's denominator and forgets to convert 1/2 into 2/4."),
        ],
    ),
    (
        "Which fraction is equivalent to 2/4?",
        [
            ("1/2", True, ""),
            ("2/2", False,
             "2/2 is one whole, but 2/4 is only half of one."),
            ("4/2", False,
             "This flips the fraction upside down, which makes it larger than one."),
        ],
    ),
    (
        "Which is larger: 2/3 or 3/5?",
        [
            ("2/3", True, ""),
            ("3/5", False,
             "Comparing the top numbers alone is misleading — over a common denominator of 15, "
             "2/3 is 10/15 while 3/5 is only 9/15."),
            ("They are equal", False,
             "They are close but not equal: 10/15 against 9/15."),
        ],
    ),
]

DEMO_USERNAMES = (
    [ADMIN["username"]]
    + [t["username"] for t in TEACHERS]
    + [s[0] for s in STUDENTS]
)


class Command(BaseCommand):
    help = "Create a realistic demo dataset for local development."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete data created by a previous seed_demo run before seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["flush"]:
            self.flush()

        if User.objects.filter(username__in=DEMO_USERNAMES).exists():
            self.stderr.write(self.style.ERROR(
                "Demo accounts already exist. Re-run with --flush to replace them."
            ))
            return

        admin = self.create_admin()
        teachers = self.create_teachers()
        students = self.create_students()
        maria, james = teachers

        hardware, maths = self.create_content(maria, james)
        classes = self.create_classes(maria, students, hardware["topic"])
        self.create_assignments(maria, classes, hardware, students)
        self.create_attempts(hardware, students)

        self.report(admin, teachers, students, hardware, maths, classes)

    # ------------------------------------------------------------------ flush

    def flush(self):
        """Delete demo rows only.

        Everything the seed creates hangs off a demo user by a CASCADE, so deleting the
        accounts is enough — topics, banks, questions, quizzes, classes, assignments and
        attempts all go with them.
        """
        deleted, _ = User.objects.filter(username__in=DEMO_USERNAMES).delete()
        self.stdout.write(f"Flushed previous demo data ({deleted} rows).")

    # ------------------------------------------------------------------ users

    def create_admin(self):
        admin = User.objects.create_superuser(
            **ADMIN, password=PASSWORD, role=User.Role.TEACHER
        )
        return admin

    def create_teachers(self):
        return [
            User.objects.create_user(**data, password=PASSWORD, role=User.Role.TEACHER)
            for data in TEACHERS
        ]

    def create_students(self):
        return [
            User.objects.create_user(
                username=username, email=f"{username}@evalio.test",
                first_name=first, last_name=last,
                password=PASSWORD, role=User.Role.STUDENT,
            )
            for username, first, last in STUDENTS
        ]

    # ---------------------------------------------------------------- content

    def build_questions(self, bank, teacher, specs):
        questions = []
        for text, choices in specs:
            question = Question.objects.create(
                question_bank=bank, text=text, created_by=teacher
            )
            for choice_text, is_correct, feedback in choices:
                Choice.objects.create(
                    question=question, text=choice_text,
                    is_correct=is_correct, feedback_text=feedback,
                )
            questions.append(question)
        return questions

    def create_content(self, maria, james):
        hardware_topic = Topic.objects.create(
            name="Computer Hardware",
            description="Input, output and storage devices for the year 5 syllabus.",
            # Deliberately a young-audience instruction, and the maths topic below
            # is deliberately an advanced one. Tuning the prompt template means
            # reading its output at both ends of that range — see
            # `manage.py draft_feedback`.
            feedback_prompt=(
                "Year 5 pupils, around ten years old. Two short sentences, warm and "
                "concrete, and use an everyday example where one fits."
            ),
            created_by=maria,
        )
        # Mirrors TopicViewSet.perform_create, which always makes a default bank.
        QuestionBank.objects.create(topic=hardware_topic, name=QuestionBank.DEFAULT_NAME)
        io_bank = QuestionBank.objects.create(
            topic=hardware_topic, name="Input & Output Devices"
        )
        storage_bank = QuestionBank.objects.create(
            topic=hardware_topic, name="Storage & Memory"
        )

        io_questions = self.build_questions(io_bank, maria, HARDWARE_IO)
        storage_questions = self.build_questions(storage_bank, maria, HARDWARE_STORAGE)

        published = Quiz.objects.create(
            topic=hardware_topic,
            title="Devices — Unit 1 check",
            description="Ten minutes. One attempt is enough; answer every question.",
            is_published=True,
            created_by=maria,
        )
        for order, question in enumerate(io_questions + storage_questions[:1]):
            QuizQuestion.objects.create(quiz=published, question=question, order=order)

        # An unpublished quiz so the Draft badge and the publish action have something
        # to act on.
        draft = Quiz.objects.create(
            topic=hardware_topic,
            title="Storage — practice (draft)",
            description="Not finished yet.",
            is_published=False,
            created_by=maria,
        )
        for order, question in enumerate(storage_questions):
            QuizQuestion.objects.create(quiz=draft, question=question, order=order)

        # A second teacher's content, so ownership filtering is visibly doing something.
        maths_topic = Topic.objects.create(
            name="Mathematics 1",
            description="Fractions and basic arithmetic.",
            feedback_prompt=(
                "Secondary pupils. Name the misconception precisely and use correct "
                "mathematical vocabulary; do not simplify the terminology."
            ),
            created_by=james,
        )
        QuestionBank.objects.create(topic=maths_topic, name=QuestionBank.DEFAULT_NAME)
        fractions_bank = QuestionBank.objects.create(topic=maths_topic, name="Fractions")
        fractions_questions = self.build_questions(fractions_bank, james, MATHS_FRACTIONS)

        maths_quiz = Quiz.objects.create(
            topic=maths_topic, title="Fractions warm-up",
            description="Five minutes.", is_published=True, created_by=james,
        )
        for order, question in enumerate(fractions_questions):
            QuizQuestion.objects.create(quiz=maths_quiz, question=question, order=order)

        return (
            {"topic": hardware_topic, "quiz": published, "draft": draft,
             "banks": [io_bank, storage_bank]},
            {"topic": maths_topic, "quiz": maths_quiz, "banks": [fractions_bank]},
        )

    # ---------------------------------------------------------------- classes

    def create_classes(self, maria, students, hardware_topic):
        year = "2025/2026"
        class_5b = Class.objects.create(name="5B", school_year=year, created_by=maria)
        class_5a = Class.objects.create(name="5A", school_year=year, created_by=maria)

        # First six students in 5B, last two in 5A.
        enrollments_5b = [
            Enrollment.objects.create(student=student, school_class=class_5b)
            for student in students[:6]
        ]
        for student in students[6:]:
            Enrollment.objects.create(student=student, school_class=class_5a)

        # The group roster is deliberately a *subset* of the class — four of the six —
        # so group-targeted assignment is distinguishable from class-targeted.
        group = TeachingGroup.objects.create(
            school_class=class_5b, topic=hardware_topic, teacher=maria
        )
        for enrollment in enrollments_5b[:4]:
            GroupMembership.objects.create(group=group, enrollment=enrollment)

        return {"5b": class_5b, "5a": class_5a, "group": group,
                "enrollments_5b": enrollments_5b}

    def create_assignments(self, maria, classes, hardware, students):
        # One assignment per targeting mode, so the assignment screen has all three.
        QuizAssignment.objects.create(
            quiz=hardware["quiz"], school_class=classes["5b"], assigned_by=maria
        )
        QuizAssignment.objects.create(
            quiz=hardware["draft"], group=classes["group"], assigned_by=maria
        )
        QuizAssignment.objects.create(
            quiz=hardware["quiz"], student=students[6], assigned_by=maria
        )

    # --------------------------------------------------------------- attempts

    def answer(self, attempt, question, correct):
        choice = question.choices.filter(is_correct=correct).first()
        if choice is None:
            return
        response = AnswerResponse(attempt=attempt, question=question)
        response.selected_choice = choice
        response.save()

    def create_attempts(self, hardware, students):
        quiz = hardware["quiz"]
        questions = [qq.question for qq in quiz.quizquestion_set.order_by("order")]

        # A perfect score — exercises the congratulatory branch.
        perfect = QuizAttempt.objects.create(student=students[0], quiz=quiz)
        for question in questions:
            self.answer(perfect, question, correct=True)
        perfect.submitted_at = timezone.now()
        perfect.save()
        generate_feedback(perfect)

        # A mixed result — this is the one that produces a real feedback passage with
        # several explanations joined by linking phrases.
        mixed = QuizAttempt.objects.create(student=students[1], quiz=quiz)
        for index, question in enumerate(questions):
            self.answer(mixed, question, correct=index % 2 == 0)
        mixed.submitted_at = timezone.now()
        mixed.save()
        generate_feedback(mixed)

        # Everything wrong, and one question left unanswered — unanswered questions
        # count against the score but contribute no explanation.
        weak = QuizAttempt.objects.create(student=students[2], quiz=quiz)
        for question in questions[:-1]:
            self.answer(weak, question, correct=False)
        weak.submitted_at = timezone.now()
        weak.save()
        generate_feedback(weak)

        # Left in progress, so resume has something to resume.
        QuizAttempt.objects.create(student=students[3], quiz=quiz)

    # ----------------------------------------------------------------- report

    def report(self, admin, teachers, students, hardware, maths, classes):
        out = self.stdout
        ok = self.style.SUCCESS

        out.write("")
        out.write(ok("Demo data created."))
        out.write("")
        out.write(f"  Password for every account below: {PASSWORD}")
        out.write("")
        out.write("  Admin (Django admin at /admin/)")
        out.write(f"    {admin.username}")
        out.write("  Teachers")
        for teacher in teachers:
            out.write(f"    {teacher.username:<12} {teacher.get_full_name()}")
        out.write("  Students")
        for student in students:
            out.write(f"    {student.username:<12} {student.get_full_name()}")
        # Scoped to demo owners — the database may hold unrelated rows, and reporting
        # global counts would misattribute them to this command.
        owners = [teacher.pk for teacher in teachers]
        topics = Topic.objects.filter(created_by__in=owners)
        banks = QuestionBank.objects.filter(topic__in=topics)
        questions = Question.objects.filter(question_bank__in=banks)
        attempts = QuizAttempt.objects.filter(student__in=[s.pk for s in students])

        out.write("")
        out.write("  Content")
        out.write(f"    {topics.count()} topics, {banks.count()} banks, "
                  f"{questions.count()} questions, "
                  f"{Choice.objects.filter(question__in=questions).count()} choices")
        out.write(f"    Published: {hardware['quiz'].title}")
        out.write(f"               {maths['quiz'].title}")
        out.write(f"    Draft:     {hardware['draft'].title}")
        out.write(f"    Classes:   5B ({classes['5b'].enrollments.count()} students, "
                  f"group roster {classes['group'].memberships.count()}), "
                  f"5A ({classes['5a'].enrollments.count()})")
        out.write(f"    Attempts:  {attempts.count()} "
                  f"({attempts.filter(submitted_at__isnull=True).count()} in progress)")
        out.write("")
        out.write("  Log in as mpetrova to see the teacher side, aivanov for a perfect")
        out.write("  score, bmarkov for a mixed result with a real feedback passage.")
        out.write("")
