from django.db.models import Count, Prefetch, Q
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

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
    QuizTeacherListSerializer,
    TopicSerializer,
)


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
                ).order_by("-created_at")
            return queryset

        # Students see only published quizzes assigned to them — see quizzes/selectors.py.
        from .selectors import quizzes_assigned_to

        return quizzes_assigned_to(user).select_related("topic")

    def get_serializer_class(self):
        if self.action == "retrieve" and self.request.user.is_student:
            return QuizDetailStudentSerializer
        if self.action == "retrieve":
            return QuizDetailTeacherSerializer
        if self.action == "list" and self.request.user.is_teacher:
            return QuizTeacherListSerializer
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
