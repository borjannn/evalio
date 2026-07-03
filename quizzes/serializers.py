from rest_framework import serializers

from .models import Choice, Module, Question, Quiz, QuizQuestion, Topic, QuestionBank


class ChoiceWriteSerializer(serializers.ModelSerializer):
    """Used by teachers: includes is_correct."""

    class Meta:
        model = Choice
        fields = ("id", "text", "is_correct")


class ChoiceReadSerializer(serializers.ModelSerializer):
    """Used by students taking a quiz: is_correct is hidden."""

    class Meta:
        model = Choice
        fields = ("id", "text")


class ModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ("id", "name", "description", "parent", "created_by", "created_at")
        read_only_fields = ("created_by", "created_at")


class QuestionTeacherSerializer(serializers.ModelSerializer):
    choices = ChoiceWriteSerializer(many=True)
    module_name = serializers.CharField(source='module.name', read_only=True)

    class Meta:
        model = Question
        fields = ("id", "question_bank", "module", "module_name", "text", "question_type", "choices", "created_by", "created_at")
        read_only_fields = ("created_by", "created_at")

    def create(self, validated_data):
        choices_data = validated_data.pop("choices")
        question = Question.objects.create(**validated_data)
        for choice_data in choices_data:
            Choice.objects.create(question=question, **choice_data)
        return question

    def update(self, instance, validated_data):
        choices_data = validated_data.pop("choices", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if choices_data is not None:
            instance.choices.all().delete()
            for choice_data in choices_data:
                Choice.objects.create(question=instance, **choice_data)
        return instance


class QuestionStudentSerializer(serializers.ModelSerializer):
    choices = ChoiceReadSerializer(many=True)

    class Meta:
        model = Question
        fields = ("id", "module", "text", "question_type", "choices")


class QuizSerializer(serializers.ModelSerializer):
    class Meta:
        model = Quiz
        fields = ("id", "topic", "title", "description", "created_by", "created_at")
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
        fields = ("id", "topic", "title", "description", "questions", "created_by", "created_at")
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
    questions = QuestionTeacherSerializer(many=True, read_only=True)

    class Meta:
        model = QuestionBank
        fields = ("id", "topic", "questions", "created_at", "updated_at")
        read_only_fields = ("created_at", "updated_at")


class TopicSerializer(serializers.ModelSerializer):
    quizzes = QuizSerializer(many=True, read_only=True)
    question_bank = QuestionBankSerializer(read_only=True)

    class Meta:
        model = Topic
        fields = ("id", "name", "description", "quizzes", "question_bank", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")


