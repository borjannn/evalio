from rest_framework import serializers

from .models import AnswerResponse, QuizAttempt


class AnswerSubmitSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    choice_id = serializers.IntegerField()


class AnswerResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnswerResponse
        fields = ("id", "question", "selected_choice", "is_correct", "answered_at")
        read_only_fields = fields


class QuizAttemptSerializer(serializers.ModelSerializer):
    answers = AnswerResponseSerializer(many=True, read_only=True)

    class Meta:
        model = QuizAttempt
        fields = ("id", "student", "quiz", "started_at", "submitted_at", "answers")
        read_only_fields = ("student", "started_at", "submitted_at", "answers")