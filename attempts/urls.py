from django.urls import path

from .views import AnswerQuestionView, StartAttemptView, SubmitAttemptView

urlpatterns = [
    path("start/", StartAttemptView.as_view(), name="attempt-start"),
    path("<int:attempt_id>/answer/", AnswerQuestionView.as_view(), name="attempt-answer"),
    path("<int:attempt_id>/submit/", SubmitAttemptView.as_view(), name="attempt-submit"),
]