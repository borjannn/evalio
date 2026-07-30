from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

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


class QuestionTeacherListSerializer(QuestionTeacherSerializer):
    """Read shape for the bank screens, adding how widely the question is reused.

    Questions are shared by reference, so editing one changes every quiz using it.
    These two numbers are what let the question form warn about that concretely
    instead of vaguely — see FRONTEND_PLAN §5.4.

    Kept separate from `QuestionTeacherSerializer` because that one is also used
    for writes and by `QuizDetailTeacherSerializer`, where the objects come from
    `quizquestion_set` and carry no annotations. A serializer field whose
    attribute is missing raises rather than returning null.
    """

    quiz_usage_count = serializers.IntegerField(read_only=True)
    submitted_answer_count = serializers.IntegerField(read_only=True)

    class Meta(QuestionTeacherSerializer.Meta):
        fields = QuestionTeacherSerializer.Meta.fields + (
            "quiz_usage_count",
            "submitted_answer_count",
        )


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


class QuizTeacherListSerializer(QuizSerializer):
    """List shape for the topic hub: how big the quiz is, and whether it's out there.

    Split from `QuizSerializer` rather than adding the fields to it because the
    student quiz list uses that one, and the annotations these read only exist on
    the teacher branch of `get_queryset()`. A serializer field whose attribute is
    missing raises rather than returning null, so the two shapes have to be
    separate — the same teacher/student split the rest of the app uses.
    """

    question_count = serializers.IntegerField(read_only=True)
    assignment_count = serializers.IntegerField(read_only=True)

    class Meta(QuizSerializer.Meta):
        fields = QuizSerializer.Meta.fields + ("question_count", "assignment_count")


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
    # How many of those questions a quiz already references. Deleting the bank
    # cascades to its questions and therefore removes them from those quizzes, so
    # the bank list warns with this number before confirming — FRONTEND_PLAN §5.6.
    questions_in_use_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = QuestionBank
        fields = (
            "id", "topic", "name", "question_count", "questions_in_use_count",
            "created_at", "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")
        # Naming a bank something you already used is an ordinary mistake, not an
        # exceptional one, so the message it produces is user-facing copy. DRF's
        # default — "The fields topic, name must make a unique set." — names the
        # database columns at a teacher. Declaring the validator explicitly
        # replaces the auto-generated one.
        #
        # It still works for a rename, which PATCHes `name` alone: on update
        # `UniqueTogetherValidator` fills the missing fields from the instance and
        # excludes the instance itself, so renaming a bank to its current name is
        # not a collision with itself.
        validators = [
            UniqueTogetherValidator(
                queryset=QuestionBank.objects.all(),
                fields=("topic", "name"),
                message="You already have a bank with that name in this topic.",
            )
        ]


class QuestionBankDetailSerializer(serializers.ModelSerializer):
    """Retrieve shape: the bank's questions, for the bank contents screen.

    The nested questions carry reuse counts, which only exist if the view
    prefetches them through an annotated queryset — see
    `QuestionBankViewSet.get_queryset`.
    """

    questions = QuestionTeacherListSerializer(many=True, read_only=True)

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
