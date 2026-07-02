from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from quizzes.models import Choice, Question, Quiz

from .models import AnswerResponse, QuizAttempt
from .serializers import AnswerSubmitSerializer, QuizAttemptSerializer


class IsStudent(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_student


class StartAttemptView(generics.CreateAPIView):
    """POST /api/attempts/start/  { "quiz_id": 1 } -> creates a new attempt."""

    permission_classes = [IsStudent]
    serializer_class = QuizAttemptSerializer

    def create(self, request, *args, **kwargs):
        quiz = get_object_or_404(Quiz, pk=request.data.get("quiz_id"))
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

        question = get_object_or_404(Question, pk=serializer.validated_data["question_id"])
        choice = get_object_or_404(Choice, pk=serializer.validated_data["choice_id"], question=question)

        answer, _ = AnswerResponse.objects.update_or_create(
            attempt=attempt,
            question=question,
            defaults={"selected_choice": choice},
        )
        return Response({"question_id": question.id, "is_correct": answer.is_correct})


class SubmitAttemptView(APIView):
    """POST /api/attempts/<attempt_id>/submit/  -> locks the attempt, triggers scoring."""

    permission_classes = [IsStudent]

    def post(self, request, attempt_id):
        attempt = get_object_or_404(QuizAttempt, pk=attempt_id, student=request.user)
        if attempt.submitted_at is not None:
            return Response({"detail": "Already submitted."}, status=status.HTTP_400_BAD_REQUEST)

        attempt.submitted_at = timezone.now()
        attempt.save()

        # TODO: call the feedback engine here once it's built (next piece)

        return Response(QuizAttemptSerializer(attempt).data)