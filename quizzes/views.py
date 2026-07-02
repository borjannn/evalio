from django.shortcuts import render
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Module, Question, Quiz
from .permissions import IsOwner, IsTeacher
from .serializers import (
    ModuleSerializer,
    QuestionTeacherSerializer,
    QuizDetailStudentSerializer,
    QuizSerializer,
)


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

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsTeacher(), IsOwner()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class QuizViewSet(viewsets.ModelViewSet):
    queryset = Quiz.objects.all()

    def get_serializer_class(self):
        if self.action == "retrieve" and self.request.user.is_student:
            return QuizDetailStudentSerializer
        return QuizSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsTeacher(), IsOwner()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)