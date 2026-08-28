from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


class Topic(models.Model):
    """A topic/subject that contains quizzes and question banks."""
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    # Lives on the topic rather than the quiz because questions are shared across
    # quizzes: a per-quiz prompt would make the right text for one choice depend on
    # which quiz you reached it through, which a single column cannot hold. The
    # cost is that a starter quiz and an end-of-unit quiz in one topic share a
    # voice; the gain is that tone is consistent by construction.
    feedback_prompt = models.TextField(
        blank=True,
        default="",
        help_text=(
            "Optional tone and detail instructions for AI-drafted feedback in this "
            "topic — e.g. 'Year 3 pupils, two short sentences, warm and concrete.' "
            "Layered on top of the built-in template; it does not replace it."
        ),
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="topics")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class QuestionBank(models.Model):
    """A named collection of reusable questions within a topic.

    A topic has many banks. Creating a topic auto-creates one named `DEFAULT_NAME`
    so there is always somewhere to put a question.
    """

    DEFAULT_NAME = "Uncategorised"

    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name="question_banks")
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["topic", "name"], name="uniq_bank_name_per_topic"),
        ]

    def __str__(self):
        return f"{self.name} ({self.topic})"


class Question(models.Model):
    class QuestionType(models.TextChoices):
        MULTIPLE_CHOICE = "mc", "Multiple choice"
        TRUE_FALSE = "tf", "True / False"

    question_bank = models.ForeignKey(QuestionBank, on_delete=models.CASCADE, related_name="questions")
    text = models.TextField()
    question_type = models.CharField(
        max_length=2, choices=QuestionType.choices, default=QuestionType.MULTIPLE_CHOICE
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="questions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Bank contents need a stable order now that modules no longer group them.
        ordering = ["created_at"]

    def __str__(self):
        return self.text[:60]


class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="choices")
    text = models.CharField(max_length=255)
    is_correct = models.BooleanField(default=False)
    feedback_text = models.TextField(
        blank=True,
        default="",
        help_text="Explanation shown to a student who picks this choice. Written by the teacher, "
                  "mainly to explain why an incorrect choice is wrong.",
    )
    # Deliberately a second column rather than a value written into the one above.
    # It keeps the teacher's version intact, makes the quiz's feedback_mode toggle
    # reversible for free, and makes "the AI never touched my writing" verifiable
    # rather than a promise.
    #
    # ⚠️ Exactly as sensitive as `feedback_text`, and absent from
    # `ChoiceReadSerializer` for the same reason: only incorrect choices carry an
    # explanation, so exposing it identifies the correct answer by elimination.
    ai_feedback_text = models.TextField(
        blank=True,
        default="",
        help_text=(
            "AI-drafted explanation for this choice. Written only by the generation "
            "service, only when `feedback_text` is blank, and never shown to a "
            "student unless the quiz's feedback_mode is 'ai'."
        ),
    )
    ai_generated_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.text} ({'correct' if self.is_correct else 'wrong'})"


class Quiz(models.Model):
    class FeedbackMode(models.TextChoices):
        TEACHER = "teacher", "Teacher-written only"
        AI = "ai", "AI-drafted, with teacher-written taking precedence"

    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name="quizzes")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    # Defaults to `teacher`, so every quiz that existed before this field kept its
    # behaviour exactly and no data migration was needed. Switching to `ai` is
    # retroactive for students who have already submitted — see
    # `feedback/services.py::generate_feedback` and docs/BACKEND.md §7.
    feedback_mode = models.CharField(
        max_length=10,
        choices=FeedbackMode.choices,
        default=FeedbackMode.TEACHER,
    )
    is_published = models.BooleanField(
        default=False,
        help_text="Controls whether assigned students can see and start this quiz. "
                  "A soft flag — a published quiz stays editable, and un-publishing "
                  "leaves existing attempts and their feedback intact.",
    )
    # Per-student presentation, not stored order. When on, each student sees the
    # questions (and/or the choices within each question) in an order randomised
    # from their own attempt id — different per student, identical on every refresh
    # of that attempt, and computed at delivery time rather than persisted. The
    # canonical `QuizQuestion.order` is untouched and is what the builder shows and
    # what students see when the flag is off. Order carries no security weight:
    # `is_correct` and the explanations are never sent to a student before they
    # submit, and answers are recorded by choice id, so shuffling is purely visual.
    # See `quizzes/serializers.py::QuizDetailStudentSerializer` and docs/BACKEND.md §4.
    shuffle_questions = models.BooleanField(
        default=False,
        help_text="Present the questions in a per-student random order at attempt time.",
    )
    shuffle_choices = models.BooleanField(
        default=False,
        help_text="Present each question's choices in a per-student random order at attempt time.",
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quizzes")
    questions = models.ManyToManyField(Question, through="QuizQuestion", related_name="quizzes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Needed for stable pagination — an unordered queryset can repeat or skip rows
        # across pages.
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class QuizModule(models.Model):
    """A named grouping of a quiz's questions, for per-module scoring after submission.

    Scoped to one quiz, not shared across quizzes or reused from a topic's other quizzes —
    the same Question can mean something different in a different quiz's curriculum, so
    grouping cannot live on Question (see QuizQuestion.module below). Deliberately flat: no
    parent/child tree. A prior "Module" model had one and was removed (migration
    quizzes.0003) in favour of named QuestionBanks; this is a narrower, different concept
    and does not reintroduce that hierarchy.
    """

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="modules")
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"), "quiz", name="uniq_quizmodule_name_per_quiz_ci"
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.quiz})"


class QuizQuestion(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE)
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=0)
    module = models.ForeignKey(
        QuizModule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quiz_questions",
        help_text="Which module this question counts toward for per-module feedback. "
        "Optional — an unassigned question still counts toward the overall score but "
        "contributes to no module breakdown.",
    )

    class Meta:
        ordering = ["order"]
        unique_together = ("quiz", "question")

    def __str__(self):
        return f"{self.quiz} #{self.order}"
