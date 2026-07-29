from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ClassViewSet,
    EnrollmentViewSet,
    GroupMembershipViewSet,
    QuizAssignmentViewSet,
    StudentSearchView,
    TeachingGroupViewSet,
)

router = DefaultRouter()
router.register("classes", ClassViewSet)
router.register("enrollments", EnrollmentViewSet)
router.register("groups", TeachingGroupViewSet)
router.register("group-memberships", GroupMembershipViewSet)
router.register("assignments", QuizAssignmentViewSet)

urlpatterns = [
    path("students/search/", StudentSearchView.as_view(), name="student-search"),
    *router.urls,
]
