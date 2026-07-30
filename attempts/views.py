from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from feedback.serializers import FeedbackResultSerializer
from feedback.services import generate_feedback
from quizzes.models import Choice, Question, Quiz, QuizQuestion
from quizzes.permissions import IsStudent
from quizzes.selectors import student_can_attempt

from .models import AnswerResponse, QuizAttempt
from .serializers import (
    AnswerSubmitSerializer,
    QuizAttemptListSerializer,
    QuizAttemptSerializer,
    QuizAttemptTeacherSerializer,
)


class StartAttemptView(APIView):
    """POST /api/attempts/start/  { "quiz_id": 1 }

    Returns the student's in-progress attempt if one exists rather than creating a
    second. Starting fresh on every call meant a refresh mid-quiz silently abandoned
    the answers already given.
    """

    permission_classes = [IsStudent]

    def post(self, request):
        quiz = get_object_or_404(Quiz, pk=request.data.get("quiz_id"))

        # Authorization, not just authentication: a quiz id is guessable, so being a
        # student is not enough — it has to be assigned to *this* student.
        if not student_can_attempt(request.user, quiz):
            return Response(
                {"detail": "This quiz is not assigned to you."},
                status=status.HTTP_403_FORBIDDEN,
            )

        attempt = QuizAttempt.objects.filter(
            student=request.user, quiz=quiz, submitted_at__isnull=True
        ).first()
        if attempt is not None:
            return Response(QuizAttemptSerializer(attempt).data, status=status.HTTP_200_OK)

        attempt = QuizAttempt.objects.create(student=request.user, quiz=quiz)
        return Response(QuizAttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)


class AnswerQuestionView(APIView):
    """POST /api/attempts/<attempt_id>/answer/  { "question_id": 1, "choice_id": 3 }"""

    permission_classes = [IsStudent]

    def post(self, request, attempt_id):
        attempt = get_object_or_404(QuizAttempt, pk=attempt_id, student=request.user)
        if attempt.submitted_at is not None:
            return Response({"detail": "Attempt already submitted."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AnswerSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # The question must belong to this attempt's quiz, and the choice to that
        # question — otherwise answers could be recorded against arbitrary rows.
        question_id = serializer.validated_data["question_id"]
        if not QuizQuestion.objects.filter(quiz=attempt.quiz, question_id=question_id).exists():
            return Response(
                {"detail": "That question is not in this quiz."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        question = get_object_or_404(Question, pk=question_id)
        choice = get_object_or_404(Choice, pk=serializer.validated_data["choice_id"], question=question)

        answer, _ = AnswerResponse.objects.get_or_create(attempt=attempt, question=question)
        answer.selected_choice = choice
        answer.save()  # save() derives is_correct and writes the snapshot

        # Deliberately does not report correctness — that would hand the student the
        # answer key mid-attempt. They find out at submit time, with the feedback.
        return Response({"question_id": question.id, "choice_id": choice.id, "saved": True})


class SubmitAttemptView(APIView):
    """POST /api/attempts/<attempt_id>/submit/  -> locks the attempt, triggers scoring."""

    permission_classes = [IsStudent]

    def post(self, request, attempt_id):
        attempt = get_object_or_404(QuizAttempt, pk=attempt_id, student=request.user)
        if attempt.submitted_at is not None:
            return Response({"detail": "Already submitted."}, status=status.HTTP_400_BAD_REQUEST)

        attempt.submitted_at = timezone.now()
        attempt.save()

        result = generate_feedback(attempt)

        return Response(
            {
                **QuizAttemptSerializer(attempt).data,
                "feedback": FeedbackResultSerializer(result).data,
            }
        )


class AttemptListView(generics.ListAPIView):
    """GET /api/attempts/ — the requesting student's own attempts, newest first."""

    permission_classes = [IsStudent]
    serializer_class = QuizAttemptListSerializer

    def get_queryset(self):
        return (
            QuizAttempt.objects.filter(student=self.request.user)
            .select_related("quiz", "feedback")
        )


class AttemptDetailView(generics.RetrieveAPIView):
    """GET /api/attempts/<pk>/ — the student who owns it, or the quiz's teacher.

    Two shapes, switched by role, the same teacher/student split the rest of the
    app uses:

    - **Student** — `QuizAttemptSerializer`. Used to resume an in-progress
      attempt. Safe because `AnswerResponseSerializer` withholds `is_correct`
      until `submitted_at` is set and never exposes the snapshotted explanation.
    - **Teacher** — `QuizAttemptTeacherSerializer`, which does expose the
      snapshots, for the §5.12 attempt review. Reachable only for attempts on a
      quiz they created; the queryset below is what enforces that.

    The switch is on `is_teacher`, so a student can never select the teacher
    shape for their own attempt.
    """

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.user.is_teacher:
            return QuizAttemptTeacherSerializer
        return QuizAttemptSerializer

    def get_queryset(self):
        user = self.request.user
        return (
            QuizAttempt.objects.filter(Q(student=user) | Q(quiz__created_by=user))
            .select_related("quiz", "student")
            .prefetch_related("answers")
        )
