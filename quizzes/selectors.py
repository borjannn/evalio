"""Query helpers shared between viewsets.

`quizzes_assigned_to` is the single definition of "which quizzes may this student
see". It is used by the quiz list, the quiz retrieve, and the attempt-start
authorization check — three places that must agree, because disagreement means either
a student can start a quiz they can't read or read one they can't start.

`assignment_audience` is its inverse, and lives here so the two can be read
together. If one gains a targeting route the other must too, or the assign screen
would promise a reach the runtime doesn't honour.
"""

from django.contrib.auth import get_user_model
from django.db.models import Q

from .models import Quiz

User = get_user_model()


def quizzes_assigned_to(student):
    """Published quizzes assigned to this student directly, via a class, or via a group.

    `.distinct()` is required: a student reachable through both their class and one of
    its subject groups would otherwise appear once per matching join row.
    """
    return Quiz.objects.filter(
        Q(assignments__student=student)
        | Q(assignments__school_class__enrollments__student=student)
        | Q(assignments__group__memberships__enrollment__student=student),
        is_published=True,
    ).distinct()


def student_can_attempt(student, quiz):
    return quizzes_assigned_to(student).filter(pk=quiz.pk).exists()


def assignment_audience(quiz):
    """Every student this quiz's assignments reach, and by which route.

    The inverse of `quizzes_assigned_to`. The assign screen needs both halves:
    the deduplicated total ("visible to 31 students" — the number a teacher
    actually wants to confirm), and per student *why* they are already covered,
    so naming someone who is already in an assigned class reads as "already
    covered via 5B" rather than silently doing nothing.

    Deliberately ignores `is_published`. This answers "who would this reach",
    which is a property of the assignments; whether the quiz is a draft is a
    separate fact the screen states separately.

    One query per assignment rather than one big union. A quiz has a handful of
    assignments, and the alternative — a single query annotated with the route —
    needs a UNION that Django can't express without losing the labels.

    Returns `[(user, [label, ...]), ...]` sorted by name, labels in assignment order.
    """
    reached: dict[int, list[str]] = {}
    students: dict[int, User] = {}

    assignments = quiz.assignments.select_related(
        "school_class", "group__school_class", "group__topic", "student"
    )

    for assignment in assignments:
        if assignment.school_class_id:
            matched = User.objects.filter(enrollments__school_class_id=assignment.school_class_id)
            label = assignment.school_class.name
        elif assignment.group_id:
            matched = User.objects.filter(
                enrollments__group_memberships__group_id=assignment.group_id
            )
            label = str(assignment.group)
        else:
            matched = User.objects.filter(pk=assignment.student_id)
            label = "Named directly"

        for student in matched.distinct():
            students.setdefault(student.pk, student)
            routes = reached.setdefault(student.pk, [])
            if label not in routes:
                routes.append(label)

    return sorted(
        ((students[pk], routes) for pk, routes in reached.items()),
        key=lambda row: (row[0].last_name, row[0].first_name, row[0].username),
    )


def question_accuracy(quiz):
    """Per-question performance on one quiz — FRONTEND_PLAN §5.11.

    The genuinely useful teacher insight on the results screen: a question
    everyone fails is usually a badly written question, and that is invisible in
    a column of per-student scores.

    ⚠️ The response filter is scoped to attempts **on this quiz**. Questions are
    shared by reference, so the same question can live in several quizzes at
    once; counting its answers unscoped would pool every quiz's results into
    each one's stats. `quizzes/tests.py` asserts this.

    Only **submitted** attempts count. An in-progress answer can still change,
    so folding it in would make the number move under the teacher.

    Returns `[(quiz_question, answered_count, correct_count), ...]` in quiz order.
    Accuracy is deliberately left to the caller: it is `correct_count` over the
    number of submitted attempts, **not** over `answered_count`, because an
    unanswered question is scored as incorrect (see `generate_feedback`) and the
    two must agree.
    """
    from django.db.models import Count, Q

    from .models import QuizQuestion

    answered_here = Q(
        question__responses__attempt__quiz=quiz,
        question__responses__attempt__submitted_at__isnull=False,
    )

    rows = (
        QuizQuestion.objects.filter(quiz=quiz)
        .select_related("question")
        .annotate(
            answered_count=Count("question__responses", filter=answered_here, distinct=True),
            correct_count=Count(
                "question__responses",
                filter=answered_here & Q(question__responses__is_correct=True),
                distinct=True,
            ),
        )
        .order_by("order")
    )
    return [(row, row.answered_count, row.correct_count) for row in rows]


def quiz_result_rows(quiz):
    """One row per student who should have taken this quiz, with their attempt.

    The results table is a roster, not an attempt log: FRONTEND_PLAN §5.11 says
    "Not started" rows matter as much as submitted ones, because chasing the
    people who haven't started is most of what the screen is for. So the rows
    come from `assignment_audience` — who the quiz reaches — and attempts are
    joined onto them, rather than the other way round.

    A student with an attempt who is **no longer** in the audience still gets a
    row, with an empty `via`. Unassigning a class after someone submitted must
    not delete their result from the screen.

    Returns `[(user, via_labels, attempt_or_None), ...]`, students without an
    attempt last within the name ordering they already have.
    """
    from attempts.models import QuizAttempt

    attempts = (
        QuizAttempt.objects.filter(quiz=quiz)
        .select_related("student", "feedback")
        .order_by("-started_at")
    )

    # An open attempt beats a finished one — the same precedence the student's
    # own home screen uses, so both screens describe the same state.
    latest: dict[int, QuizAttempt] = {}
    for attempt in attempts:
        current = latest.get(attempt.student_id)
        if current is None or (current.submitted_at is not None and attempt.submitted_at is None):
            latest[attempt.student_id] = attempt

    rows = []
    seen: set[int] = set()
    for student, via in assignment_audience(quiz):
        seen.add(student.pk)
        rows.append((student, via, latest.get(student.pk)))

    for student_id, attempt in latest.items():
        if student_id not in seen:
            rows.append((attempt.student, [], attempt))

    return rows
