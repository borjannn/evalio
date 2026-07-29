from django.urls import path

from .views import (
    AnswerQuestionView,
    AttemptDetailView,
    AttemptListView,
    StartAttemptView,
    SubmitAttemptView,
)

urlpatterns = [
    path("", AttemptListView.as_view(), name="attempt-list"),
    path("start/", StartAttemptView.as_view(), name="attempt-start"),
    path("<int:pk>/", AttemptDetailView.as_view(), name="attempt-detail"),
    path("<int:attempt_id>/answer/", AnswerQuestionView.as_view(), name="attempt-answer"),
    path("<int:attempt_id>/submit/", SubmitAttemptView.as_view(), name="attempt-submit"),
]
