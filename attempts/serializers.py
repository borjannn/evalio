from rest_framework import serializers

from .models import AnswerResponse, QuizAttempt


class AnswerSubmitSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    choice_id = serializers.IntegerField()


class AnswerResponseSerializer(serializers.ModelSerializer):
    """One saved answer.

    `choice_feedback_text` and `question_text` are snapshot fields on the model and are
    deliberately absent here. The explanation is teacher-authored and only ever reaches
    a student inside the assembled `FeedbackResult` after submission — exposing it on
    the answer would hand over the answer key mid-quiz, since in practice only incorrect
    choices carry one.
    """

    is_correct = serializers.SerializerMethodField()

    class Meta:
        model = AnswerResponse
        fields = ("id", "question", "selected_choice", "is_correct", "answered_at")
        read_only_fields = fields

    def get_is_correct(self, obj):
        """Withheld until the attempt is submitted, so it can't be read mid-quiz."""
        if obj.attempt.submitted_at is None:
            return None
        return obj.is_correct


class QuizAttemptSerializer(serializers.ModelSerializer):
    answers = AnswerResponseSerializer(many=True, read_only=True)
    quiz_title = serializers.CharField(source="quiz.title", read_only=True)

    class Meta:
        model = QuizAttempt
        fields = (
            "id", "student", "quiz", "quiz_title",
            "started_at", "submitted_at", "answers",
        )
        read_only_fields = ("student", "started_at", "submitted_at", "answers")


class QuizAttemptListSerializer(serializers.ModelSerializer):
    """List shape — no nested answers, plus the score once one exists."""

    quiz_title = serializers.CharField(source="quiz.title", read_only=True)
    score_percent = serializers.FloatField(source="feedback.score_percent", read_only=True)
    correct_count = serializers.IntegerField(source="feedback.correct_count", read_only=True)
    total_count = serializers.IntegerField(source="feedback.total_count", read_only=True)

    class Meta:
        model = QuizAttempt
        fields = (
            "id", "quiz", "quiz_title", "started_at", "submitted_at",
            "score_percent", "correct_count", "total_count",
        )
        read_only_fields = fields


class TeacherAttemptListSerializer(QuizAttemptListSerializer):
    """What a teacher sees on the results screen: the same, plus who it was."""

    student_username = serializers.CharField(source="student.username", read_only=True)
    student_first_name = serializers.CharField(source="student.first_name", read_only=True)
    student_last_name = serializers.CharField(source="student.last_name", read_only=True)

    class Meta(QuizAttemptListSerializer.Meta):
        fields = QuizAttemptListSerializer.Meta.fields + (
            "student", "student_username", "student_first_name", "student_last_name",
        )
        read_only_fields = fields
