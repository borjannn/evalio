from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from .models import Choice, Question, QuestionBank, Quiz, QuizQuestion, Topic


class ChoiceWriteSerializer(serializers.ModelSerializer):
    """Used by teachers: includes is_correct and the per-choice explanation.

    `id` is declared explicitly because `ModelSerializer` makes it read-only by
    default, and `QuestionTeacherSerializer.update` needs the incoming id to tell
    an edited choice from a new one.

    `ai_feedback_text` is **read-only** here. The teacher's editor reads it to show
    what was drafted and to mark the field as AI-written, but the only thing that
    may write it is the generation service — a client PATCH that could set it would
    make "this sentence was drafted, not written" unverifiable. `feedback_text`
    stays writable: accepting a suggestion is a normal edit of the teacher's own
    field.
    """

    id = serializers.IntegerField(required=False)

    class Meta:
        model = Choice
        fields = (
            "id", "text", "is_correct", "feedback_text",
            "ai_feedback_text", "ai_generated_at",
        )
        read_only_fields = ("ai_feedback_text", "ai_generated_at")


class ChoiceReadSerializer(serializers.ModelSerializer):
    """
    Used by students taking a quiz: is_correct is hidden.

    `feedback_text` is hidden too, and must stay that way. In practice only incorrect
    choices carry an explanation, so exposing the field would let a student identify
    the correct answer by looking for the empty one.

    ⚠️ `ai_feedback_text` is hidden for exactly the same reason and is not an
    exception to it. Same field, same leak, different author.
    """

    class Meta:
        model = Choice
        fields = ("id", "text")


class QuestionTeacherSerializer(serializers.ModelSerializer):
    choices = ChoiceWriteSerializer(many=True)
    # Which bank a question came from is contextual metadata in the quiz builder
    # and the deciding label in a cross-bank search, so both screens need the name
    # rather than the id. Read-only, so it is ignored on write — `question_bank`
    # stays the writable field.
    question_bank_name = serializers.CharField(source="question_bank.name", read_only=True)

    class Meta:
        model = Question
        fields = (
            "id", "question_bank", "question_bank_name", "text", "question_type",
            "choices", "created_by", "created_at",
        )
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
    instead of vaguely — see docs/FRONTEND.md §9.

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
        fields = (
            "id", "topic", "title", "description", "is_published", "feedback_mode",
            "created_by", "created_at",
        )
        read_only_fields = ("created_by", "created_at")

    def validate(self, attrs):
        """The publish gate: a quiz in `ai` mode may not go live with gaps.

        This is the strongest available guarantee that a student never meets an
        empty explanation, and it is why generation is retryable per question
        rather than per quiz — filling the gaps has to be something a teacher can
        finish.

        It checks the **resulting** state, not the incoming fields, so it catches
        both ways in: publishing a quiz that is already in `ai` mode, and switching
        an already-published quiz to `ai`. A PATCH that touches neither field still
        passes through here, which is deliberate — a quiz cannot become invalid by
        having its title edited, and re-checking costs one prefetch.

        Deliberately does **not** apply in `teacher` mode. Publishing with blanks
        stays allowed exactly as it always was, and a student who meets one gets
        the existing `NO_EXPLANATIONS_TEXT` fallback.
        """
        attrs = super().validate(attrs)
        instance = self.instance

        is_published = attrs.get(
            "is_published", instance.is_published if instance else False
        )
        mode = attrs.get(
            "feedback_mode", instance.feedback_mode if instance else Quiz.FeedbackMode.TEACHER
        )

        if not (is_published and mode == Quiz.FeedbackMode.AI and instance is not None):
            return attrs

        from feedback.suggestions import gaps_for_quiz

        gaps = gaps_for_quiz(instance)
        if gaps:
            # The message carries the count; the linkable list of *which* choices
            # lives on `/feedback-readiness/`. Two reasons not to repeat it here:
            # DRF coerces every value inside a ValidationError to a string, so the
            # ids would arrive as `"217"`, and the builder screen has already
            # fetched readiness to draw its gap badge. One structured source.
            raise serializers.ValidationError(
                {
                    "feedback_mode": (
                        f"{len(gaps)} wrong "
                        f"{'choice has' if len(gaps) == 1 else 'choices have'} no "
                        "explanation yet. Draft the missing feedback, or switch this "
                        "quiz back to teacher-written mode, before publishing."
                    ),
                    "gap_count": len(gaps),
                }
            )
        return attrs


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
    # Submitted attempts, counted the same way as `TopicSerializer.attempt_count`
    # so the topic card and the rows underneath it add up.
    attempt_count = serializers.IntegerField(read_only=True)

    class Meta(QuizSerializer.Meta):
        fields = QuizSerializer.Meta.fields + (
            "question_count", "assignment_count", "attempt_count",
        )


class QuizStudentListSerializer(serializers.ModelSerializer):
    """List shape for the student's home screen (docs/FRONTEND.md §7).

    Narrower than `QuizSerializer`, not wider: `is_published` and `created_by` are
    dropped. Every quiz reaching a student is published by definition — that is
    what `quizzes_assigned_to` filters on — so the flag would only ever read True,
    and who wrote a quiz is not the student's business.

    `question_count` is an annotation from the student branch of `get_queryset()`.
    Like every other count in this file it must be `distinct=True`: the assignment
    joins in `quizzes_assigned_to` multiply the question rows otherwise, and a
    5-question quiz reachable through both a class and a group reports 10.

    The two attempt ids are what docs/FRONTEND.md §7's Not started / In progress / Completed
    comes from. They are annotations rather than something the client derives by
    also fetching `/attempts/`, because that list is paginated at 25 — a student
    with more attempts than that would see finished quizzes reported as untouched,
    and the bug would only appear for the busiest students.

    ⚠️ Attempt *ids* only. No score and no correctness: this shape is read before
    a quiz is taken, so anything derived from the answer key is out (docs/FRONTEND.md §6).
    """

    topic_name = serializers.CharField(source="topic.name", read_only=True)
    question_count = serializers.IntegerField(read_only=True)
    # Null unless the requesting student has such an attempt. `allow_null` because
    # the Subquery returns NULL, which IntegerField would otherwise reject.
    open_attempt_id = serializers.IntegerField(read_only=True, allow_null=True)
    completed_attempt_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Quiz
        fields = (
            "id", "title", "description", "topic_name", "question_count",
            "open_attempt_id", "completed_attempt_id", "created_at",
        )


class QuizDetailTeacherSerializer(serializers.ModelSerializer):
    """Full quiz details for teachers with all questions and choices.

    This is what the quiz builder renders, so it is the one place a whole quiz is
    serialized at once — and the one most exposed to N+1. The joins below are
    load-bearing rather than tidying: without them a 20-question quiz costs 40
    extra queries to draw one screen.
    """

    questions = serializers.SerializerMethodField()

    def get_questions(self, obj):
        quiz_questions = (
            obj.quizquestion_set.select_related("question__question_bank")
            .prefetch_related("question__choices")
            .order_by("order")
        )
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
            "id", "topic", "title", "description", "is_published", "feedback_mode",
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
    # the bank list warns with this number before confirming — docs/FRONTEND.md §7.
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
    # Submitted attempts at every quiz in this topic. In-progress attempts are
    # excluded on purpose: the number is there so a teacher can tell from the
    # dashboard which topics have statistics worth opening, so it counts exactly
    # what /api/analytics/ counts. An unfinished attempt has no score and appears
    # nowhere on that screen.
    attempt_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Topic
        fields = (
            "id", "name", "description", "feedback_prompt", "quiz_count",
            "question_bank_count", "attempt_count", "created_by", "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")
