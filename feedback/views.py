from django.shortcuts import get_object_or_404
from rest_framework import generics

from attempts.models import QuizAttempt

from .models import FeedbackResult
from .serializers import FeedbackResultSerializer


class AttemptFeedbackView(generics.RetrieveAPIView):
    """GET /api/feedback/attempts/<attempt_id>/ -> feedback for one submitted attempt."""

    serializer_class = FeedbackResultSerializer

    def get_object(self):
        attempt = get_object_or_404(QuizAttempt, pk=self.kwargs["attempt_id"])
        user = self.request.user
        # Students see only their own; the teacher who owns the quiz sees any attempt on it.
        if not (attempt.student_id == user.id or attempt.quiz.created_by_id == user.id):
            self.permission_denied(self.request, message="Not your attempt.")
        return get_object_or_404(FeedbackResult, attempt=attempt)


class MyFeedbackListView(generics.ListAPIView):
    """GET /api/feedback/mine/ -> the requesting student's feedback, newest first."""

    serializer_class = FeedbackResultSerializer

    def get_queryset(self):
        return (
            FeedbackResult.objects.filter(attempt__student=self.request.user)
            .select_related("attempt__quiz")
            .order_by("-created_at")
        )
