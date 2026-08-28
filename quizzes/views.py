from django.conf import settings
from django.db import transaction
from django.db.models import Count, IntegerField, Max, OuterRef, Prefetch, Q, Subquery
from django.db.models.functions import Coalesce
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .imports import QuestionImportError, parse_import
from .models import Question, QuestionBank, Quiz, QuizQuestion, Topic
from .permissions import IsOwner, IsTeacher, IsTopicOwner
from .serializers import (
    QuestionBankDetailSerializer,
    QuestionBankSerializer,
    QuestionTeacherListSerializer,
    QuestionTeacherSerializer,
    QuizDetailStudentSerializer,
    QuizDetailTeacherSerializer,
    QuizSerializer,
    QuizStudentListSerializer,
    QuizTeacherListSerializer,
    TopicSerializer,
)


def _first_error(detail):
    """The first human-readable string out of a DRF error detail, however nested.

    A serializer rejection during import (a field the pure validator does not cover,
    like an over-long question) arrives as a nested dict/list. The import surfaces
    one sentence per bad question, so this reaches in and pulls the first one.
    """
    if isinstance(detail, dict):
        return next((_first_error(value) for value in detail.values()), "invalid.")
    if isinstance(detail, list):
        return _first_error(detail[0]) if detail else "invalid."
    return str(detail)


def questions_with_usage():
    """Questions annotated with how widely they are reused.

    Questions are shared by reference, so editing one changes every quiz that
    references it. The frontend warns about that before saving, and needs numbers
    to make the warning concrete rather than vague.

    `submitted_answer_count` counts answers on **submitted** attempts only. An
    in-progress attempt can still change its answers, so it is not yet a result
    that an edit would make inconsistent.

    `distinct=True` on both: two joins in one query multiply each other's rows.
    """
    return Question.objects.annotate(
        quiz_usage_count=Count("quizzes", distinct=True),
        submitted_answer_count=Count(
            "responses",
            filter=Q(responses__attempt__submitted_at__isnull=False),
            distinct=True,
        ),
    )


def submitted_attempt_count_subquery(lookup):
    """How many **submitted** attempts a row has, as a scalar subquery not a join.

    `lookup` is the path from `QuizAttempt` back to the row being annotated:
    `"quiz"` when annotating a Quiz, `"quiz__topic"` when annotating a Topic.

    ⚠️ The filter pair is `analytics/selectors.py::submitted_attempts` verbatim,
    and copying it is the point rather than an accident. This number exists so a
    teacher can see from the dashboard which topics have statistics worth
    opening; if it counted a wider set than the statistics screen does, it would
    send them to a screen that then disagreed with the card they came from.
    Change one, change the other.

    `feedback__isnull=False` looks redundant beside `submitted_at__isnull=False`
    and is not quite: `SubmitAttemptView` stamps `submitted_at` and calls
    `generate_feedback` in two steps without a transaction, so a request that
    dies between them leaves a submitted attempt with nothing to score. The
    statistics screen skips those, so this skips them too.

    ⚠️ Not `Count("attempts", distinct=True)`, even though that is what the
    counts beside it use. Those already join two tables; adding a third makes the
    intermediate result their product — a quiz with 20 questions, 3 assignments
    and 200 attempts would build 12,000 rows for the database to deduplicate, and
    a topic is worse again because its attempts arrive through its quizzes. The
    answers would be *correct* (that is what `distinct=True` buys) and the query
    would get slower in proportion to numbers that only grow. A subquery is
    evaluated per row and joins nothing.

    Two details that look removable and are not:

    - `.order_by()` clears `QuizAttempt.Meta.ordering`. Left on, the ordering
      column joins the GROUP BY and splits the count into one row per attempt,
      so the subquery returns the first of many 1s instead of the total.
    - `Coalesce(..., 0)` because a row with no attempts matches nothing and the
      subquery yields NULL. Zero is the honest answer here — unlike a mean score,
      where "nobody has submitted" and "everyone scored zero" are different facts,
      a count of nothing genuinely is nought.
    """
    from attempts.models import QuizAttempt

    return Coalesce(
        Subquery(
            QuizAttempt.objects.filter(
                submitted_at__isnull=False,
                feedback__isnull=False,
                **{lookup: OuterRef("pk")},
            )
            .order_by()
            .values(lookup)
            .annotate(total=Count("pk"))
            .values("total"),
            output_field=IntegerField(),
        ),
        0,
    )


class TopicViewSet(viewsets.ModelViewSet):
    queryset = Topic.objects.all()
    serializer_class = TopicSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "description"]

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and user.is_teacher:
            # `.annotate()` adds a GROUP BY, which makes `QuerySet.ordered` False even
            # though Meta.ordering is set — and an unordered queryset paginates
            # inconsistently, so a row can appear on two pages or none. Order explicitly.
            return (
                Topic.objects.filter(created_by=user)
                .annotate(
                    quiz_count=Count("quizzes", distinct=True),
                    question_bank_count=Count("question_banks", distinct=True),
                    # Submitted attempts at every quiz in the topic — the
                    # dashboard card's "is there anything to read here?" number,
                    # which is why it counts the same set the statistics screen
                    # does rather than everything that was ever started.
                    attempt_count=submitted_attempt_count_subquery("quiz__topic"),
                )
                .order_by("-created_at")
            )
        return Topic.objects.none()

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated(), IsTeacher()]
        return [IsTeacher(), IsOwner()]

    def perform_create(self, serializer):
        # Every topic starts with one bank so there is always somewhere to put a question.
        topic = serializer.save(created_by=self.request.user)
        QuestionBank.objects.create(topic=topic, name=QuestionBank.DEFAULT_NAME)


class QuestionBankViewSet(viewsets.ModelViewSet):
    queryset = QuestionBank.objects.all()
    serializer_class = QuestionBankSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_queryset(self):
        user = self.request.user
        if not (user.is_authenticated and user.is_teacher):
            return QuestionBank.objects.none()

        queryset = QuestionBank.objects.filter(topic__created_by=user).select_related("topic")
        topic_id = self.request.query_params.get("topic")
        if topic_id:
            queryset = queryset.filter(topic_id=topic_id)

        if self.action == "retrieve":
            # Prefetch through the annotated queryset, so the nested questions
            # carry their reuse counts. A plain `prefetch_related("questions")`
            # would yield unannotated objects and the serializer would raise.
            return queryset.prefetch_related(
                Prefetch(
                    "questions",
                    queryset=questions_with_usage()
                    .prefetch_related("choices")
                    .order_by("created_at"),
                )
            )
        # `questions_in_use_count` is what makes the delete confirmation concrete.
        # Question.question_bank is CASCADE and QuizQuestion.question is CASCADE, so
        # deleting a bank deletes its questions and silently pulls them out of every
        # quiz built from them. The teacher has to be told that before confirming.
        #
        # distinct=True on both: the second join through quizzes multiplies the first,
        # so a bank of 4 questions each used in 3 quizzes would report 12 questions.
        return queryset.annotate(
            question_count=Count("questions", distinct=True),
            questions_in_use_count=Count(
                "questions",
                filter=Q(questions__quizzes__isnull=False),
                distinct=True,
            ),
        ).order_by("name")

    def get_serializer_class(self):
        if self.action == "retrieve":
            return QuestionBankDetailSerializer
        return QuestionBankSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated(), IsTeacher()]
        return [IsTeacher(), IsTopicOwner()]

    def perform_create(self, serializer):
        # A bank has no `created_by` of its own — it inherits ownership from its topic,
        # so the topic must be verified here rather than by an object-level permission.
        topic = serializer.validated_data["topic"]
        if topic.created_by_id != self.request.user.id:
            self.permission_denied(self.request, message="You do not own this topic.")
        serializer.save()


class QuestionViewSet(viewsets.ModelViewSet):
    queryset = Question.objects.all()
    serializer_class = QuestionTeacherSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["text"]

    def get_queryset(self):
        user = self.request.user
        if not (user.is_authenticated and user.is_teacher):
            return Question.objects.none()

        base = (
            questions_with_usage()
            if self.action in ("list", "retrieve")
            else Question.objects.all()
        )
        queryset = (
            base.filter(question_bank__topic__created_by=user)
            .select_related("question_bank")
            .prefetch_related("choices")
        )
        bank_id = self.request.query_params.get("question_bank")
        if bank_id:
            queryset = queryset.filter(question_bank_id=bank_id)

        # `?topic=` is what the quiz builder's bank picker searches on: a teacher
        # usually remembers the question, not which bank they filed it in, so the
        # picker has to search every bank in the topic at once (docs/FRONTEND.md §8).
        topic_id = self.request.query_params.get("topic")
        if topic_id:
            queryset = queryset.filter(question_bank__topic_id=topic_id)

        if self.action == "list":
            # `.annotate()` adds a GROUP BY, which makes `QuerySet.ordered` False
            # even with Meta.ordering — and an unordered queryset paginates
            # inconsistently. Order explicitly.
            queryset = queryset.order_by("created_at")
        return queryset

    def get_serializer_class(self):
        # Reads carry the reuse counts; writes use the plain shape.
        if self.action in ("list", "retrieve"):
            return QuestionTeacherListSerializer
        return QuestionTeacherSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated(), IsTeacher()]
        return [IsTeacher(), IsTopicOwner()]

    def perform_create(self, serializer):
        bank = serializer.validated_data["question_bank"]
        if bank.topic.created_by_id != self.request.user.id:
            self.permission_denied(self.request, message="You do not own this question bank.")
        serializer.save(created_by=self.request.user)

    @action(
        detail=True,
        methods=["post"],
        url_path="suggest-feedback",
        permission_classes=[IsTeacher, IsTopicOwner],
    )
    def suggest_feedback(self, request, pk=None):
        """POST /api/questions/{id}/suggest-feedback/ — draft wrong-choice explanations.

        Returns drafts **without writing them**. The teacher is looking straight at
        the field when they press Suggest, so the draft belongs in their hands to
        accept or discard; a round trip through storage would add a state to manage
        for no benefit. Accepting one is the ordinary `PATCH /api/questions/{id}/`
        nested write, which already diffs choices by id — no new write endpoint.

        An optional `choice_id` in the body narrows the draft to one choice — the
        per-field button — instead of every wrong choice. One call either way; the
        difference is how many explanations the one call asks for, which is what
        keeps a per-field click cheap on a metered key.

        `get_object()` runs against the ownership-filtered queryset, so another
        teacher's question is a 404 here exactly as it is everywhere else.
        """
        from feedback.providers import ProviderUnavailable
        from feedback.suggestions import suggest_for_choice, suggest_for_question

        question = self.get_object()

        raw_choice_id = request.data.get("choice_id")
        choice_id = None
        if raw_choice_id is not None:
            try:
                choice_id = int(raw_choice_id)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "choice_id must be an integer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            if choice_id is not None:
                draft = suggest_for_choice(question, choice_id)
            else:
                draft = suggest_for_question(question)
        except ProviderUnavailable as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not draft.ok:
            # 502: the request was fine, the upstream model was not.
            return Response(
                {"detail": "Could not draft feedback for this question.", "reason": draft.error},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                "suggestions": [
                    {"choice_id": choice_id, "text": text}
                    for choice_id, text in draft.suggestions.items()
                ]
            }
        )


class QuizViewSet(viewsets.ModelViewSet):
    queryset = Quiz.objects.all()

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Quiz.objects.none()

        if user.is_teacher:
            queryset = Quiz.objects.filter(created_by=user).select_related("topic")

            topic_id = self.request.query_params.get("topic")
            if topic_id:
                queryset = queryset.filter(topic_id=topic_id)

            if self.action == "list":
                # `.annotate()` adds a GROUP BY, which makes `QuerySet.ordered` False
                # even though Meta.ordering is set — and an unordered queryset
                # paginates inconsistently. Order explicitly.
                #
                # distinct=True on both: without it the two joins multiply, and a
                # quiz with 5 questions assigned to 3 classes reports 15 of each.
                queryset = queryset.annotate(
                    question_count=Count("questions", distinct=True),
                    assignment_count=Count("assignments", distinct=True),
                    attempt_count=submitted_attempt_count_subquery("quiz"),
                ).order_by("-created_at")
            return queryset

        # Students see only published quizzes assigned to them — see quizzes/selectors.py.
        from .selectors import quizzes_assigned_to

        queryset = quizzes_assigned_to(user).select_related("topic")
        if self.action == "list":
            from attempts.models import QuizAttempt

            # This student's own attempts on each quiz, as scalar subqueries. The
            # student home screen turns them into Not started / In progress /
            # Completed (docs/FRONTEND.md §7). Two subqueries rather than a join,
            # so neither can multiply the question count below, and neither costs
            # a query per row.
            def latest_attempt(**filters):
                return QuizAttempt.objects.filter(
                    quiz=OuterRef("pk"), student=user, **filters
                ).order_by("-started_at").values("pk")[:1]

            # Same rule as the teacher branch above: annotate() adds a GROUP BY,
            # which makes `QuerySet.ordered` False and silently breaks pagination,
            # so order explicitly. distinct=True because quizzes_assigned_to joins
            # through assignments and would otherwise multiply the question rows.
            queryset = queryset.annotate(
                question_count=Count("questions", distinct=True),
                open_attempt_id=Subquery(latest_attempt(submitted_at__isnull=True)),
                completed_attempt_id=Subquery(latest_attempt(submitted_at__isnull=False)),
            ).order_by("-created_at")
        return queryset

    def get_serializer_context(self):
        # `QuizDetailStudentSerializer` seeds its per-student question/choice shuffle
        # from this. None whenever there is no open attempt (or the quiz has neither
        # shuffle flag on), which the serializer reads as "use the canonical order".
        context = super().get_serializer_context()
        context["shuffle_seed"] = getattr(self, "_shuffle_seed", None)
        context["open_attempt_id"] = getattr(self, "_open_attempt_id", None)
        context["completed_attempt_id"] = getattr(self, "_completed_attempt_id", None)
        return context

    def retrieve(self, request, *args, **kwargs):
        """Resolve this student's attempt state before serializing, for students only.

        The *open* attempt id doubles as the shuffle seed — there is at most one,
        enforced in `StartAttemptView` — so the order a student sees is fixed for the
        whole duration of that attempt and cannot be re-rolled by refreshing. The
        seed is only applied when a shuffle is actually on, but both ids are always
        resolved so the intro screen can mirror the list card's CTA (Resume / View
        feedback) rather than always offering Start. Ids only, no score.
        """
        if request.user.is_student:
            instance = self.get_object()
            from attempts.models import QuizAttempt

            attempts = QuizAttempt.objects.filter(student=request.user, quiz=instance)
            self._open_attempt_id = (
                attempts.filter(submitted_at__isnull=True)
                .values_list("id", flat=True)
                .first()
            )
            self._completed_attempt_id = (
                attempts.filter(submitted_at__isnull=False)
                .order_by("-started_at")
                .values_list("id", flat=True)
                .first()
            )
            if instance.shuffle_questions or instance.shuffle_choices:
                self._shuffle_seed = self._open_attempt_id
        return super().retrieve(request, *args, **kwargs)

    def get_serializer_class(self):
        if self.action == "retrieve" and self.request.user.is_student:
            return QuizDetailStudentSerializer
        if self.action == "retrieve":
            return QuizDetailTeacherSerializer
        if self.action == "list" and self.request.user.is_teacher:
            return QuizTeacherListSerializer
        if self.action == "list":
            return QuizStudentListSerializer
        return QuizSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsTeacher(), IsOwner()]

    def perform_create(self, serializer):
        topic = serializer.validated_data["topic"]
        if topic.created_by_id != self.request.user.id:
            self.permission_denied(self.request, message="You do not own this topic.")
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        """Save, and rebuild submitted feedback if the feedback mode changed.

        The mode is retroactive — see `feedback/services.py::rebuild_feedback_for_quiz`.
        Both texts were snapshotted onto the answers at answer time, so this costs
        one small query per submitted attempt and no API calls at all.

        Wrapped in a transaction with the save so a quiz can never end up in `ai`
        mode while its students' feedback still reads from the teacher's text.
        `update_or_create` inside `generate_feedback` makes a retry harmless.
        """
        from feedback.services import rebuild_feedback_for_quiz

        previous_mode = serializer.instance.feedback_mode
        with transaction.atomic():
            quiz = serializer.save()
            if quiz.feedback_mode != previous_mode:
                rebuild_feedback_for_quiz(quiz)

    @action(
        detail=True,
        methods=["post"],
        url_path="generate-feedback",
        permission_classes=[IsTeacher, IsOwner],
    )
    def generate_feedback(self, request, pk=None):
        """POST /api/quizzes/{id}/generate-feedback/ — draft every blank wrong choice.

        Writes `ai_feedback_text` directly, because bulk output is reviewed in place
        rather than field by field. It never touches `feedback_text`, and skips any
        choice that already has one.

        Partial success is normal and is reported honestly rather than being
        flattened into an error: one question failing out of thirty should not
        discard the twenty-nine that worked, and re-running regenerates only what is
        still blank, so the response doubles as the retry instruction.
        """
        from feedback.providers import ProviderUnavailable
        from feedback.suggestions import generate_for_quiz

        quiz = self.get_object()
        try:
            result = generate_for_quiz(quiz)
        except ProviderUnavailable as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(
            {
                "generated": result.generated,
                "skipped_teacher_written": result.skipped_teacher_written,
                "failed": result.failures,
                "remaining_gaps": result.remaining_gaps,
            }
        )

    @action(
        detail=True,
        methods=["get"],
        url_path="feedback-readiness",
        permission_classes=[IsTeacher, IsOwner],
    )
    def feedback_readiness(self, request, pk=None):
        """GET /api/quizzes/{id}/feedback-readiness/ — what is written and what is missing.

        Powers the builder's "29 drafted · 5 yours · 2 gaps" summary, the publish
        gate's explanation, and the "this will make N calls" warning shown before a
        bulk run starts.

        `can_publish_as_ai` is computed here rather than left to the client so the
        button's enabled state and the serializer's validation cannot disagree —
        both come from `gaps_for_quiz`.
        """
        from feedback.suggestions import gaps_for_quiz, planned_call_count, readiness_for_quiz

        quiz = self.get_object()
        gaps = gaps_for_quiz(quiz)
        return Response(
            {
                "mode": quiz.feedback_mode,
                **readiness_for_quiz(quiz),
                "gaps": [
                    {
                        "question_id": question.id,
                        "question_text": question.text,
                        "choice_id": choice.id,
                        "choice_text": choice.text,
                    }
                    for question, choice in gaps
                ],
                "can_publish_as_ai": not gaps,
                "planned_call_count": planned_call_count(quiz),
                "ai_enabled": settings.AI_FEEDBACK_ENABLED,
            }
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="set-question-module",
        permission_classes=[IsTeacher, IsOwner],
    )
    def set_question_module(self, request, pk=None):
        """POST /api/quizzes/{id}/set-question-module/ — assign or clear one question's module.

        Body: `{"quiz_question_id": int, "module": int|null, "new_module_name": str|null}`.
        Exactly one of `module` (an existing module id, must belong to this quiz — 404 if
        not, the same "cross-scope id is invisible" rule `import_questions` applies to bank
        ids) or `new_module_name` (matched case-insensitively against this quiz's existing
        modules before a new one is created) may be given; neither clears the assignment.
        """
        quiz = self.get_object()
        quiz_question = quiz.quizquestion_set.filter(
            id=request.data.get("quiz_question_id")
        ).first()
        if quiz_question is None:
            return Response(
                {"detail": "That question is not in this quiz."},
                status=status.HTTP_404_NOT_FOUND,
            )

        raw_module_id = request.data.get("module")
        new_module_name = (request.data.get("new_module_name") or "").strip()
        if raw_module_id is not None and new_module_name:
            return Response(
                {"detail": "Provide 'module' or 'new_module_name', not both."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if raw_module_id is not None:
            module = quiz.modules.filter(id=raw_module_id).first()
            if module is None:
                return Response(
                    {"detail": "That module is not in this quiz."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            quiz_question.module = module
        elif new_module_name:
            module = quiz.modules.filter(name__iexact=new_module_name).first()
            if module is None:
                module = quiz.modules.create(name=new_module_name)
            quiz_question.module = module
        else:
            quiz_question.module = None

        quiz_question.save(update_fields=["module"])
        return Response(
            {"quiz_question_id": quiz_question.id, "module": quiz_question.module_id}
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="generate-modules",
        permission_classes=[IsTeacher, IsOwner],
    )
    def generate_modules(self, request, pk=None):
        """POST /api/quizzes/{id}/generate-modules/ — group every question in one AI call.

        One call for the whole quiz rather than one per question, so unlike
        `generate_feedback` there is no per-question failure list and nothing to poll
        progress on — the response comes back synchronously. Only questions with no
        module yet are written; a teacher's manual assignment is never overwritten.
        """
        from feedback.module_grouping import generate_modules_for_quiz
        from feedback.providers import ProviderUnavailable

        quiz = self.get_object()
        try:
            result = generate_modules_for_quiz(quiz)
        except ProviderUnavailable as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not result.ok:
            return Response(
                {"detail": "Could not group this quiz's questions.", "reason": result.error},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                "modules_created": result.modules_created,
                "questions_assigned": result.questions_assigned,
                "skipped_assigned": result.skipped_assigned,
            }
        )

    @action(detail=True, methods=["post"], permission_classes=[IsTeacher, IsOwner])
    def add_question(self, request, pk=None):
        """Add a question to the quiz."""
        quiz = self.get_object()
        question_id = request.data.get("question_id")
        order = request.data.get("order", 0)

        if not question_id:
            return Response(
                {"error": "question_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only questions from a bank this teacher owns — otherwise a quiz could pull in
        # another teacher's question by id.
        question = (
            Question.objects.filter(id=question_id, question_bank__topic__created_by=request.user)
            .first()
        )
        if question is None:
            return Response(
                {"error": "Question not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if quiz.questions.filter(id=question_id).exists():
            return Response(
                {"error": "Question already in this quiz"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quiz_question = QuizQuestion.objects.create(quiz=quiz, question=question, order=order)

        return Response(
            {
                "id": quiz_question.id,
                "quiz": quiz.id,
                "question": question.id,
                "order": quiz_question.order,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], permission_classes=[IsTeacher, IsOwner])
    def remove_question(self, request, pk=None):
        """Remove a question from the quiz."""
        quiz = self.get_object()
        question_id = request.data.get("question_id")

        if not question_id:
            return Response(
                {"error": "question_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        deleted, _ = QuizQuestion.objects.filter(quiz=quiz, question_id=question_id).delete()
        if not deleted:
            return Response(
                {"error": "Question not in this quiz"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="import-questions",
        permission_classes=[IsTeacher, IsOwner],
    )
    def import_questions(self, request, pk=None):
        """POST /api/quizzes/{id}/import-questions/ — create questions from JSON, add them.

        All-or-nothing: every question is validated and created, and a `QuizQuestion`
        links each to the quiz in order, or nothing is written. A single malformed
        question fails the whole import with its position named — a half-imported
        quiz the builder then reports as finished is worse than a clean refusal.

        Validation (`quizzes/imports.py`) is pure and runs first, so a bad payload is
        rejected before any row is written. Creation then reuses
        `QuestionTeacherSerializer`, so the import inherits the form's rules —
        `ai_feedback_text` stays read-only, choices will diff by id on later edits —
        and the pure validator adds the one the serializer does not carry: exactly
        one correct choice.

        Questions are filed in a bank in this quiz's topic: an existing `bank` id, or
        a `new_bank_name` created in the same transaction so a later failure cannot
        orphan it.
        """
        quiz = self.get_object()

        # Validate the whole payload before touching the database.
        try:
            questions_data = parse_import(request.data.get("questions"))
        except QuestionImportError as exc:
            return self._import_error(exc)

        # Resolve the target bank. An existing id is ownership-checked now (a read);
        # a new bank is created inside the transaction below.
        raw_bank_id = request.data.get("bank")
        new_bank_name = (request.data.get("new_bank_name") or "").strip()
        existing_bank = None
        if raw_bank_id is not None:
            existing_bank = QuestionBank.objects.filter(id=raw_bank_id, topic=quiz.topic).first()
            if existing_bank is None:
                # 404-shaped: another topic's bank must not be distinguishable from a
                # missing one, the same rule the rest of the app follows.
                return Response(
                    {"detail": "That question bank is not in this quiz's topic."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        elif not new_bank_name:
            return Response(
                {"detail": "Provide 'bank' (an existing id) or 'new_bank_name'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                bank = existing_bank or QuestionBank.objects.create(
                    topic=quiz.topic, name=new_bank_name
                )
                highest = quiz.quizquestion_set.aggregate(highest=Max("order"))["highest"]
                start = 0 if highest is None else highest + 1

                created_ids = []
                for offset, data in enumerate(questions_data):
                    data["question_bank"] = bank.id
                    serializer = QuestionTeacherSerializer(data=data)
                    try:
                        serializer.is_valid(raise_exception=True)
                    except DRFValidationError as exc:
                        # A field-level rejection the pure validator does not cover
                        # (e.g. an over-long text). Re-raised so it too names the
                        # question and rolls the whole transaction back.
                        raise QuestionImportError(offset, _first_error(exc.detail)) from exc
                    question = serializer.save(created_by=request.user)
                    QuizQuestion.objects.create(quiz=quiz, question=question, order=start + offset)
                    created_ids.append(question.id)
        except QuestionImportError as exc:
            return self._import_error(exc)

        return Response(
            {"created": len(created_ids), "question_ids": created_ids, "bank": bank.id},
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _import_error(exc):
        """One import failure, as a 400 that names the question's 1-based position."""
        return Response(
            {"detail": f"Question {exc.index + 1}: {exc.message}", "question_index": exc.index},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["get"], permission_classes=[IsTeacher, IsOwner])
    def attempts(self, request, pk=None):
        """GET /api/quizzes/{id}/attempts/ — every attempt on this teacher's quiz."""
        from attempts.models import QuizAttempt
        from attempts.serializers import TeacherAttemptListSerializer

        quiz = self.get_object()
        queryset = (
            QuizAttempt.objects.filter(quiz=quiz)
            .select_related("student", "quiz", "feedback")
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response(TeacherAttemptListSerializer(page, many=True).data)
        return Response(TeacherAttemptListSerializer(queryset, many=True).data)

    @action(detail=True, methods=["get"], permission_classes=[IsTeacher, IsOwner])
    def results(self, request, pk=None):
        """GET /api/quizzes/{id}/results/ — everything the docs/FRONTEND.md §7 screen shows.

        One endpoint for one screen: a roster row per student the quiz reaches,
        the header summary, and per-question accuracy. They are three shapes but
        one question — "how did this quiz go" — and splitting them would make the
        screen fetch three times to draw one table with one header.

        **Unpaginated**, for the same reason `audience/` is: the rows *are* the
        audience, the screen filters and totals across all of them, and a mean
        score computed over page 1 would be a lie. One teacher's audience is a
        few classes' worth of students. See Known gaps for the cohort size where
        that stops being true.

        ⚠️ Teacher-only, and it carries `is_correct` per question. `IsOwner` plus
        the `get_queryset()` ownership filter is what keeps it that way.
        """
        from attempts.serializers import TeacherAttemptListSerializer
        from classes.serializers import StudentSummarySerializer

        from .selectors import question_accuracy, quiz_result_rows

        quiz = self.get_object()
        rows = quiz_result_rows(quiz)

        submitted = [attempt for _, _, attempt in rows if attempt and attempt.submitted_at]
        in_progress = [
            attempt for _, _, attempt in rows if attempt and attempt.submitted_at is None
        ]
        # Over submitted attempts only, and None rather than 0 when there are
        # none — "no one has finished yet" and "everyone scored zero" are very
        # different facts and the screen must not conflate them.
        scores = [a.feedback.score_percent for a in submitted if hasattr(a, "feedback")]
        mean_score = round(sum(scores) / len(scores), 1) if scores else None

        return Response(
            {
                "summary": {
                    "assigned_count": len([row for row in rows if row[1]]),
                    "submitted_count": len(submitted),
                    "in_progress_count": len(in_progress),
                    "not_started_count": len([r for r in rows if r[2] is None]),
                    "mean_score_percent": mean_score,
                },
                "questions": [
                    {
                        "id": quiz_question.question_id,
                        "text": quiz_question.question.text,
                        "order": quiz_question.order,
                        "answered_count": answered,
                        "correct_count": correct,
                    }
                    for quiz_question, answered, correct in question_accuracy(quiz)
                ],
                "rows": [
                    {
                        **StudentSummarySerializer(student).data,
                        "via": via,
                        "attempt": (
                            TeacherAttemptListSerializer(attempt).data if attempt else None
                        ),
                    }
                    for student, via, attempt in rows
                ],
            }
        )

    @action(detail=True, methods=["get"], permission_classes=[IsTeacher, IsOwner])
    def audience(self, request, pk=None):
        """GET /api/quizzes/{id}/audience/ — who this quiz's assignments reach.

        The assign screen (docs/FRONTEND.md §7) needs the deduplicated total, and
        needs to mark an individual who is already covered by an assigned class
        with the reason. Both come from `assignment_audience`, the inverse of the
        selector that decides what a student may see — see quizzes/selectors.py.

        Unpaginated: the caller wants the whole set to diff a search against, and
        one teacher's audience is a few classes' worth of students.
        """
        from classes.serializers import StudentSummarySerializer

        from .selectors import assignment_audience

        quiz = self.get_object()
        rows = assignment_audience(quiz)
        return Response(
            {
                "student_count": len(rows),
                "students": [
                    {**StudentSummarySerializer(student).data, "via": routes}
                    for student, routes in rows
                ],
            }
        )

    @action(detail=True, methods=["post"], permission_classes=[IsTeacher, IsOwner])
    def reorder(self, request, pk=None):
        """Set the order of every question in one atomic call.

        Body: `{"question_ids": [12, 7, 3]}` — position in the list becomes the order.

        Replaces the old client-side loop of remove_question/add_question calls, which
        was neither atomic nor idempotent: an interruption part-way through left the
        quiz missing questions.
        """
        quiz = self.get_object()
        question_ids = request.data.get("question_ids")

        if not isinstance(question_ids, list):
            return Response(
                {"error": "question_ids must be a list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows = {qq.question_id: qq for qq in QuizQuestion.objects.filter(quiz=quiz)}
        if set(question_ids) != set(rows):
            return Response(
                {"error": "question_ids must name exactly the questions currently in this quiz"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for order, question_id in enumerate(question_ids):
            rows[question_id].order = order
        QuizQuestion.objects.bulk_update(rows.values(), ["order"])

        return Response({"question_ids": question_ids})
