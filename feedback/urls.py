from django.urls import path

from .views import AttemptFeedbackView, MyFeedbackListView

urlpatterns = [
    path("mine/", MyFeedbackListView.as_view(), name="feedback-mine"),
    path("attempts/<int:attempt_id>/", AttemptFeedbackView.as_view(), name="feedback-attempt"),
]
