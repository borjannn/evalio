from rest_framework.routers import DefaultRouter

from .views import QuestionBankViewSet, QuestionViewSet, QuizViewSet, TopicViewSet

router = DefaultRouter()
router.register("topics", TopicViewSet)
router.register("question-banks", QuestionBankViewSet)
router.register("questions", QuestionViewSet)
router.register("quizzes", QuizViewSet)

urlpatterns = router.urls
