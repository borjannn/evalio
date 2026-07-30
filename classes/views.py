from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from rest_framework import generics, status, viewsets
from rest_framework.response import Response

from quizzes.permissions import IsTeacher

from .models import Class, Enrollment, GroupMembership, QuizAssignment, TeachingGroup
from .serializers import (
    ClassSerializer,
    EnrollmentSerializer,
    GroupMembershipSerializer,
    QuizAssignmentSerializer,
    StudentSummarySerializer,
    TeachingGroupSerializer,
)

User = get_user_model()

MIN_SEARCH_LENGTH = 3


def students_visible_to(teacher):
    """Students enrolled in one of this teacher's classes.

    Directory search is scoped to this set rather than to all users. A global search
    would let any teacher account enumerate every student in the system.
    """
    return User.objects.filter(
        enrollments__school_class__created_by=teacher, role=User.Role.STUDENT
    ).distinct()


class TeacherOwnedViewSet(viewsets.ModelViewSet):
    """Shared shape for the roster models.

    None of these carry `created_by` themselves — ownership is reached through a
    relation — so `get_queryset` does the object-level work: a row belonging to
    another teacher is filtered out before `get_object` sees it, which surfaces as
    404 rather than 403. That is the better answer anyway, since a 403 would confirm
    the row exists.
    """

    permission_classes = [IsTeacher]
    owner_filter = None

    def get_queryset(self):
        user = self.request.user
        if not (user.is_authenticated and user.is_teacher):
            return self.queryset.none()
        return self.queryset.filter(**{self.owner_filter: user})


class ClassViewSet(TeacherOwnedViewSet):
    queryset = Class.objects.all()
    serializer_class = ClassSerializer
    owner_filter = "created_by"

    def get_queryset(self):
        # Explicit order_by: annotate() adds a GROUP BY, which drops Meta.ordering as far
        # as DRF pagination is concerned and makes page boundaries non-deterministic.
        return (
            super().get_queryset()
            .annotate(student_count=Count("enrollments", distinct=True))
            .order_by("-school_year", "name")
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class EnrollmentViewSet(TeacherOwnedViewSet):
    # The prefetch feeds `EnrollmentSerializer.get_group_names`, which draws the
    # roster's per-student group badges. Without it a 30-student roster costs 60
    # extra queries.
    queryset = Enrollment.objects.select_related("student", "school_class").prefetch_related(
        "group_memberships__group__topic"
    )
    serializer_class = EnrollmentSerializer
    owner_filter = "school_class__created_by"

    def get_queryset(self):
        queryset = super().get_queryset()
        class_id = self.request.query_params.get("school_class")
        if class_id:
            queryset = queryset.filter(school_class_id=class_id)
        return queryset

    def perform_create(self, serializer):
        school_class = serializer.validated_data["school_class"]
        if school_class.created_by_id != self.request.user.id:
            self.permission_denied(self.request, message="You do not own this class.")
        serializer.save()


class TeachingGroupViewSet(TeacherOwnedViewSet):
    queryset = TeachingGroup.objects.select_related("school_class", "topic")
    serializer_class = TeachingGroupSerializer
    owner_filter = "teacher"

    def get_queryset(self):
        queryset = (
            super().get_queryset()
            .annotate(member_count=Count("memberships", distinct=True))
            .order_by("school_class__name", "topic__name")
        )
        class_id = self.request.query_params.get("school_class")
        if class_id:
            queryset = queryset.filter(school_class_id=class_id)
        return queryset

    def perform_create(self, serializer):
        school_class = serializer.validated_data["school_class"]
        topic = serializer.validated_data["topic"]
        if school_class.created_by_id != self.request.user.id:
            self.permission_denied(self.request, message="You do not own this class.")
        if topic.created_by_id != self.request.user.id:
            self.permission_denied(self.request, message="You do not own this topic.")
        serializer.save(teacher=self.request.user)


class GroupMembershipViewSet(TeacherOwnedViewSet):
    queryset = GroupMembership.objects.select_related("group", "enrollment__student")
    serializer_class = GroupMembershipSerializer
    owner_filter = "group__teacher"

    def get_queryset(self):
        queryset = super().get_queryset()
        group_id = self.request.query_params.get("group")
        if group_id:
            queryset = queryset.filter(group_id=group_id)
        return queryset

    def perform_create(self, serializer):
        group = serializer.validated_data["group"]
        if group.teacher_id != self.request.user.id:
            self.permission_denied(self.request, message="You do not own this group.")
        serializer.save()


class QuizAssignmentViewSet(TeacherOwnedViewSet):
    queryset = QuizAssignment.objects.select_related("quiz", "school_class", "group", "student")
    serializer_class = QuizAssignmentSerializer
    owner_filter = "quiz__created_by"

    def get_queryset(self):
        queryset = super().get_queryset()
        quiz_id = self.request.query_params.get("quiz")
        if quiz_id:
            queryset = queryset.filter(quiz_id=quiz_id)
        return queryset

    def perform_create(self, serializer):
        quiz = serializer.validated_data["quiz"]
        if quiz.created_by_id != self.request.user.id:
            self.permission_denied(self.request, message="You do not own this quiz.")

        # Assigning to a class or group you don't own would push a quiz into another
        # teacher's roster.
        school_class = serializer.validated_data.get("school_class")
        if school_class and school_class.created_by_id != self.request.user.id:
            self.permission_denied(self.request, message="You do not own this class.")
        group = serializer.validated_data.get("group")
        if group and group.teacher_id != self.request.user.id:
            self.permission_denied(self.request, message="You do not own this group.")

        # A named individual must already be one of this teacher's students, otherwise
        # assignment becomes a way to reach any account by id.
        student = serializer.validated_data.get("student")
        if student and not students_visible_to(self.request.user).filter(pk=student.pk).exists():
            self.permission_denied(
                self.request, message="That student is not enrolled in any of your classes."
            )

        serializer.save(assigned_by=self.request.user)


class StudentSearchView(generics.ListAPIView):
    """GET /api/students/search/?q=  — scoped, minimum 3 characters, never returns email."""

    permission_classes = [IsTeacher]
    serializer_class = StudentSummarySerializer
    pagination_class = None

    def list(self, request, *args, **kwargs):
        query = request.query_params.get("q", "").strip()
        if len(query) < MIN_SEARCH_LENGTH:
            return Response(
                {"detail": f"Enter at least {MIN_SEARCH_LENGTH} characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        query = self.request.query_params.get("q", "").strip()
        if len(query) < MIN_SEARCH_LENGTH:
            return User.objects.none()
        return students_visible_to(self.request.user).filter(
            Q(username__icontains=query)
            | Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
        )[:20]
