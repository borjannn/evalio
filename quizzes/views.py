from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Module, Question, Quiz, Topic, QuestionBank, QuizQuestion
from .permissions import IsOwner, IsTeacher, IsTopicOwner
from .serializers import (
    ModuleSerializer,
    QuestionTeacherSerializer,
    QuizDetailStudentSerializer,
    QuizSerializer,
    QuizDetailTeacherSerializer,
    TopicSerializer,
    QuestionBankSerializer,
)


class TopicViewSet(viewsets.ModelViewSet):
    queryset = Topic.objects.all()
    serializer_class = TopicSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and user.is_teacher:
            return Topic.objects.filter(created_by=user)
        return Topic.objects.none()

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated(), IsTeacher()]
        return [IsTeacher(), IsOwner()]

    def perform_create(self, serializer):
        # Automatically create a question bank for the topic
        topic = serializer.save(created_by=self.request.user)
        QuestionBank.objects.create(topic=topic)


class QuestionBankViewSet(viewsets.ModelViewSet):
    queryset = QuestionBank.objects.all()
    serializer_class = QuestionBankSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and user.is_teacher:
            return QuestionBank.objects.filter(topic__created_by=user)
        return QuestionBank.objects.none()

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated(), IsTeacher()]
        return [IsTeacher(), IsTopicOwner()]


class ModuleViewSet(viewsets.ModelViewSet):
    queryset = Module.objects.all()
    serializer_class = ModuleSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsTeacher(), IsOwner()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class QuestionViewSet(viewsets.ModelViewSet):
    queryset = Question.objects.all()
    serializer_class = QuestionTeacherSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and user.is_teacher:
            return Question.objects.filter(created_by=user)
        return Question.objects.none()

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated(), IsTeacher()]
        return [IsTeacher(), IsTopicOwner()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class QuizViewSet(viewsets.ModelViewSet):
    queryset = Quiz.objects.all()

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and user.is_teacher:
            return Quiz.objects.filter(created_by=user)
        return Quiz.objects.none()

    def get_serializer_class(self):
        if self.action == "retrieve":
            if self.request.user.is_student:
                return QuizDetailStudentSerializer
            else:
                return QuizDetailTeacherSerializer
        return QuizSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated(), IsTeacher()]
        return [IsTeacher(), IsOwner()]

    def perform_create(self, serializer):
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

        try:
            question = Question.objects.get(id=question_id)
        except Question.DoesNotExist:
            return Response(
                {"error": "Question not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check if question already in quiz
        if quiz.questions.filter(id=question_id).exists():
            return Response(
                {"error": "Question already in this quiz"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quiz_question, created = QuizQuestion.objects.get_or_create(
            quiz=quiz, question=question, defaults={"order": order}
        )

        if not created:
            quiz_question.order = order
            quiz_question.save()

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

        try:
            QuizQuestion.objects.get(quiz=quiz, question_id=question_id).delete()
        except QuizQuestion.DoesNotExist:
            return Response(
                {"error": "Question not in this quiz"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)
