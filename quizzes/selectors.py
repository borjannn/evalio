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
