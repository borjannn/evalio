from rest_framework import serializers

from .models import Choice, Question, QuestionBank, Quiz, QuizQuestion, Topic


class ChoiceWriteSerializer(serializers.ModelSerializer):
    """Used by teachers: includes is_correct and the per-choice explanation.

    `id` is declared explicitly because `ModelSerializer` makes it read-only by
    default, and `QuestionTeacherSerializer.update` needs the incoming id to tell
    an edited choice from a new one.
    """

    id = serializers.IntegerField(required=False)

    class Meta:
        model = Choice
        fields = ("id", "text", "is_correct", "feedback_text")


class ChoiceReadSerializer(serializers.ModelSerializer):
    """
    Used by students taking a quiz: is_correct is hidden.

    `feedback_text` is hidden too, and must stay that way. In practice only incorrect
    choices carry an explanation, so exposing the field would let a student identify
    the correct answer by looking for the empty one.
    """

    class Meta:
        model = Choice
        fields = ("id", "text")


class QuestionTeacherSerializer(serializers.ModelSerializer):
    choices = ChoiceWriteSerializer(many=True)

    class Meta:
        model = Question
        fields = ("id", "question_bank", "text", "question_type", "choices", "created_by", "created_at")
        read_only_fields = ("created_by", "created_at")

    def create(self, validated_data):
        choices_data = validated_data.pop("choices")
        question = Question.objects.create(**validated_data)
        for choice_data in choices_data:
            choice_data.pop("id", None)
            Choice.objects.create(question=question, **choice_data)
        return question

    def update(self, instance, validated_data):
        """Diff the choices rather than delete-and-recreate them.

        Recreating would orphan every `AnswerResponse` that points at a choice, so a
        teacher fixing a typo would detach the submitted work of everyone who had
        already answered. Matching on id keeps untouched choices stable.
        """
        choices_data = validated_data.pop("choices", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if choices_data is None:
            return instance

        existing = {choice.id: choice for choice in instance.choices.all()}
        seen_ids = set()

        for choice_data in choices_data:
            choice_id = choice_data.pop("id", None)
            choice = existing.get(choice_id)
            if choice is None:
                Choice.objects.create(question=instance, **choice_data)
                continue
            for attr, value in choice_data.items():
                setattr(choice, attr, value)
            choice.save()
            seen_ids.add(choice.id)

        removed = set(existing) - seen_ids
        if removed:
            Choice.objects.filter(id__in=removed).delete()

        return instance


class QuestionStudentSerializer(serializers.ModelSerializer):
    choices = ChoiceReadSerializer(many=True)

    class Meta:
        model = Question
        fields = ("id", "text", "question_type", "choices")


class QuizSerializer(serializers.ModelSerializer):
    class Meta:
        model = Quiz
        fields = ("id", "topic", "title", "description", "is_published", "created_by", "created_at")
        read_only_fields = ("created_by", "created_at")


class QuizDetailTeacherSerializer(serializers.ModelSerializer):
    """Full quiz details for teachers with all questions and choices."""
    questions = serializers.SerializerMethodField()

    def get_questions(self, obj):
        quiz_questions = obj.quizquestion_set.all().order_by("order")
        return [
            {
                **QuestionTeacherSerializer(qq.question).data,
                "order": qq.order,
                "quiz_question_id": qq.id,
            }
            for qq in quiz_questions
        ]

    class Meta:
        model = Quiz
        fields = (
            "id", "topic", "title", "description", "is_published",
            "questions", "created_by", "created_at",
        )
        read_only_fields = ("created_by", "created_at")


class QuizQuestionOrderSerializer(serializers.ModelSerializer):
    question = QuestionStudentSerializer(read_only=True)

    class Meta:
        model = QuizQuestion
        fields = ("id", "question", "order")


class QuizDetailStudentSerializer(serializers.ModelSerializer):
    """What a student sees when starting a quiz: questions, no answers."""

    quiz_questions = QuizQuestionOrderSerializer(source="quizquestion_set", many=True, read_only=True)

    class Meta:
        model = Quiz
        fields = ("id", "title", "description", "quiz_questions")


class QuestionBankSerializer(serializers.ModelSerializer):
    """List shape: a count instead of the questions themselves.

    A topic can hold many banks of many questions each. Nesting the questions here
    would make the topic detail screen fetch the entire question tree to render a
    list of bank names.
    """

    question_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = QuestionBank
        fields = ("id", "topic", "name", "question_count", "created_at", "updated_at")
        read_only_fields = ("created_at", "updated_at")


class QuestionBankDetailSerializer(serializers.ModelSerializer):
    """Retrieve shape: the bank's questions, for the bank contents screen."""

    questions = QuestionTeacherSerializer(many=True, read_only=True)

    class Meta:
        model = QuestionBank
        fields = ("id", "topic", "name", "questions", "created_at", "updated_at")
        read_only_fields = ("created_at", "updated_at")


class TopicSerializer(serializers.ModelSerializer):
    """Topic list/detail. Deliberately shallow.

    Nesting quizzes -> banks -> questions -> choices here made `GET /api/topics/`
    cost a query per row at every level and return a payload the dashboard never
    displayed. Both are fetched from their own endpoints instead.
    """

    quiz_count = serializers.IntegerField(read_only=True)
    question_bank_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Topic
        fields = (
            "id", "name", "description", "quiz_count", "question_bank_count",
            "created_by", "created_at", "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")
