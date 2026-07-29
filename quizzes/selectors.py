"""Query helpers shared between viewsets.

`quizzes_assigned_to` is the single definition of "which quizzes may this student
see". It is used by the quiz list, the quiz retrieve, and the attempt-start
authorization check — three places that must agree, because disagreement means either
a student can start a quiz they can't read or read one they can't start.
"""

from django.db.models import Q

from .models import Quiz


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
