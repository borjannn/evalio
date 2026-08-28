from rest_framework import serializers

from .models import FeedbackResult


class FeedbackResultSerializer(serializers.ModelSerializer):
    quiz_title = serializers.CharField(source="attempt.quiz.title", read_only=True)

    class Meta:
        model = FeedbackResult
        fields = (
            "id",
            "attempt",
            "quiz_title",
            "feedback_text",
            "module_feedback_text",
            "score_percent",
            "correct_count",
            "total_count",
            "created_at",
        )
        read_only_fields = fields
