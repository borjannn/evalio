from rest_framework.routers import DefaultRouter

from .views import ModuleViewSet, QuestionViewSet, QuizViewSet, TopicViewSet, QuestionBankViewSet

router = DefaultRouter()
router.register("topics", TopicViewSet)
router.register("question-banks", QuestionBankViewSet)
router.register("modules", ModuleViewSet)
router.register("questions", QuestionViewSet)
router.register("quizzes", QuizViewSet)

urlpatterns = router.urls