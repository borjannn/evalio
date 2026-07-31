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


class AnswerResponseTeacherSerializer(serializers.ModelSerializer):
    """The teacher half of the pair — docs/FRONTEND.md §7.

    This is the **only** serializer that exposes `AnswerResponse`'s snapshot
    fields, and it must never reach a student endpoint. `choice_feedback_text` is
    the teacher's explanation of why a choice is wrong, so in practice only
    incorrect choices carry one; handing it over identifies the correct answer by
    elimination.

    It reads the snapshots rather than the live `Question` and `Choice` on
    purpose. Answers are historical records: both FKs are `SET_NULL`, and editing
    a question after an attempt was submitted must not rewrite what the screen
    says the student saw. When a question has since been deleted the FK is null
    and the snapshot is all that is left — which is exactly when it matters most.

    `is_correct` is read straight from the model here, not withheld: this
    serializer is only ever used for a teacher reading a submitted attempt.
    """

    question_text = serializers.CharField(read_only=True)
    choice_text = serializers.CharField(read_only=True)
    choice_feedback_text = serializers.CharField(read_only=True)

    class Meta:
        model = AnswerResponse
        fields = (
            "id", "question", "selected_choice", "is_correct",
            "question_text", "choice_text", "choice_feedback_text", "answered_at",
        )
        read_only_fields = fields


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


class QuizAttemptTeacherSerializer(QuizAttemptSerializer):
    """One attempt as its quiz's author sees it: the answers carry their snapshots."""

    answers = AnswerResponseTeacherSerializer(many=True, read_only=True)
    student_username = serializers.CharField(source="student.username", read_only=True)
    student_first_name = serializers.CharField(source="student.first_name", read_only=True)
    student_last_name = serializers.CharField(source="student.last_name", read_only=True)

    class Meta(QuizAttemptSerializer.Meta):
        fields = QuizAttemptSerializer.Meta.fields + (
            "student_username", "student_first_name", "student_last_name",
        )


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
