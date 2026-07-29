from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "role", "first_name", "last_name")


class RegisterSerializer(serializers.ModelSerializer):
    """Public registration — always creates a student.

    `role` is read-only and forced server-side. Accepting it from the client meant
    anyone could self-register as a teacher and get the whole authoring API, plus
    whatever a teacher can see of other people's students.

    Teacher accounts are created out of band: `manage.py createsuperuser` followed by
    setting `role` in the admin, or directly in the admin by an existing superuser.
    """

    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ("id", "username", "email", "password", "role", "first_name", "last_name")
        read_only_fields = ("role",)

    def create(self, validated_data):
        password = validated_data.pop("password")
        validated_data.pop("role", None)
        user = User(**validated_data, role=User.Role.STUDENT)
        user.set_password(password)
        user.save()
        return user
