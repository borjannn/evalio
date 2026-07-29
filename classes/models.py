from django.conf import settings
from django.db import models
from django.db.models import Q

from quizzes.models import Quiz, Topic


class Class(models.Model):
    """A year-group cohort, e.g. "5B" in 2025/2026.

    Owned by the teacher who created it. A single-teacher deployment is the assumption:
    two teachers who both teach 5B each get their own row. Sharing one across teachers
    would need a School model and an admin role.
    """

    name = models.CharField(max_length=100)
    school_year = models.CharField(max_length=20, help_text='e.g. "2025/2026"')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="classes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "classes"
        ordering = ["-school_year", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "school_year", "created_by"],
                name="uniq_class_per_year_per_teacher",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.school_year})"


class Enrollment(models.Model):
    """A student's membership of a class.

    A join model rather than an FK on User, so a student who moves 5B -> 6B keeps both
    rows and last year's results stay attributable to last year's class.
    """

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="enrollments"
    )
    school_class = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="enrollments")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["student__last_name", "student__first_name"]
        constraints = [
            models.UniqueConstraint(fields=["student", "school_class"], name="uniq_enrollment"),
        ]

    def __str__(self):
        return f"{self.student} in {self.school_class}"


class TeachingGroup(models.Model):
    """A subject group within a class, e.g. "5B — Mathematics"."""

    school_class = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="groups")
    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name="groups")
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="teaching_groups"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["school_class__name", "topic__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["school_class", "topic", "teacher"], name="uniq_teaching_group"
            ),
        ]

    def __str__(self):
        return f"{self.school_class} — {self.topic}"


class GroupMembership(models.Model):
    """Which enrolled students are in this subject group — a subset of the class.

    Points at `Enrollment`, not at `User`, deliberately. That makes "a group member is
    enrolled in the group's class" a structural guarantee rather than a validation rule
    someone can forget: you cannot add a student to 5B—Mathematics unless they are in
    5B, and removing them from 5B cascades them out of its groups automatically.
    """

    group = models.ForeignKey(TeachingGroup, on_delete=models.CASCADE, related_name="memberships")
    enrollment = models.ForeignKey(
        Enrollment, on_delete=models.CASCADE, related_name="group_memberships"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["enrollment__student__last_name", "enrollment__student__first_name"]
        constraints = [
            models.UniqueConstraint(fields=["group", "enrollment"], name="uniq_group_membership"),
        ]

    def __str__(self):
        return f"{self.enrollment.student} in {self.group}"


class QuizAssignment(models.Model):
    """Who a quiz is assigned to: a whole class, a subject group, or one student.

    Three nullable FKs rather than a GenericForeignKey. A GFK cannot be joined or
    filtered in SQL, so resolving "which quizzes are assigned to me" would become
    application-level fan-out, and it gives up referential integrity — nothing would
    stop the target row disappearing.
    """

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="assignments")

    school_class = models.ForeignKey(
        Class, null=True, blank=True, on_delete=models.CASCADE, related_name="quiz_assignments"
    )
    group = models.ForeignKey(
        TeachingGroup, null=True, blank=True, on_delete=models.CASCADE,
        related_name="quiz_assignments",
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE,
        related_name="quiz_assignments",
    )

    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assignments_made"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-assigned_at"]
        constraints = [
            models.CheckConstraint(
                # Django 5.1 deprecated `check=` and 6.0 removed it — this kwarg is `condition`.
                condition=(
                    Q(school_class__isnull=False, group__isnull=True, student__isnull=True)
                    | Q(school_class__isnull=True, group__isnull=False, student__isnull=True)
                    | Q(school_class__isnull=True, group__isnull=True, student__isnull=False)
                ),
                name="quizassignment_exactly_one_target",
            ),
            # Partial unique indexes, not unique_together: Postgres treats every NULL as
            # distinct, so ("quiz", "school_class") would never fire for student-targeted
            # rows and duplicates would slip through.
            models.UniqueConstraint(
                fields=["quiz", "school_class"], condition=Q(school_class__isnull=False),
                name="uniq_assignment_class",
            ),
            models.UniqueConstraint(
                fields=["quiz", "group"], condition=Q(group__isnull=False),
                name="uniq_assignment_group",
            ),
            models.UniqueConstraint(
                fields=["quiz", "student"], condition=Q(student__isnull=False),
                name="uniq_assignment_student",
            ),
        ]

    def __str__(self):
        return f"{self.quiz} -> {self.target}"

    @property
    def target(self):
        return self.school_class or self.group or self.student
