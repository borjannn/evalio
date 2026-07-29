from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Class, Enrollment, GroupMembership, QuizAssignment, TeachingGroup

User = get_user_model()


class StudentSummarySerializer(serializers.ModelSerializer):
    """The only shape in which a student's identity is exposed to a teacher.

    Deliberately omits `email`. Roster and directory-search screens need to tell two
    students apart, which a name plus username does; handing out addresses would turn
    any teacher account into a contact-list export.
    """

    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name")
        read_only_fields = fields


class ClassSerializer(serializers.ModelSerializer):
    student_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Class
        fields = ("id", "name", "school_year", "student_count", "created_by", "created_at")
        read_only_fields = ("created_by", "created_at")


class EnrollmentSerializer(serializers.ModelSerializer):
    student_detail = StudentSummarySerializer(source="student", read_only=True)

    class Meta:
        model = Enrollment
        fields = ("id", "student", "student_detail", "school_class", "created_at")
        read_only_fields = ("created_at",)

    def validate_student(self, value):
        if not value.is_student:
            raise serializers.ValidationError("Only students can be enrolled in a class.")
        return value


class TeachingGroupSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source="school_class.name", read_only=True)
    topic_name = serializers.CharField(source="topic.name", read_only=True)
    member_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = TeachingGroup
        fields = (
            "id", "school_class", "class_name", "topic", "topic_name",
            "member_count", "teacher", "created_at",
        )
        read_only_fields = ("teacher", "created_at")


class GroupMembershipSerializer(serializers.ModelSerializer):
    student_detail = StudentSummarySerializer(source="enrollment.student", read_only=True)

    class Meta:
        model = GroupMembership
        fields = ("id", "group", "enrollment", "student_detail", "created_at")
        read_only_fields = ("created_at",)

    def validate(self, attrs):
        group = attrs.get("group")
        enrollment = attrs.get("enrollment")
        if group and enrollment and enrollment.school_class_id != group.school_class_id:
            raise serializers.ValidationError(
                "That student is not enrolled in this group's class."
            )
        return attrs


class QuizAssignmentSerializer(serializers.ModelSerializer):
    target_type = serializers.SerializerMethodField()
    target_label = serializers.SerializerMethodField()

    class Meta:
        model = QuizAssignment
        fields = (
            "id", "quiz", "school_class", "group", "student",
            "target_type", "target_label", "assigned_by", "assigned_at",
        )
        read_only_fields = ("assigned_by", "assigned_at")

    def get_target_type(self, obj):
        if obj.school_class_id:
            return "class"
        if obj.group_id:
            return "group"
        return "student"

    def get_target_label(self, obj):
        return str(obj.target)

    def validate(self, attrs):
        """Mirror the database CheckConstraint so the client gets 400, not 500.

        The constraint is the real guarantee — this is only for a readable error.
        """
        targets = [attrs.get("school_class"), attrs.get("group"), attrs.get("student")]
        if sum(target is not None for target in targets) != 1:
            raise serializers.ValidationError(
                "Assign to exactly one of: school_class, group, or student."
            )
        student = attrs.get("student")
        if student is not None and not student.is_student:
            raise serializers.ValidationError("Quizzes can only be assigned to students.")
        return attrs
