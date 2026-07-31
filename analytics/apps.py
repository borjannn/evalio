from django.apps import AppConfig


class AnalyticsConfig(AppConfig):
    """Read-only app: it owns no models, only ways of asking about other apps'.

    Deliberately its own app rather than another action on `QuizViewSet`. The quiz
    results endpoint answers one question about one quiz; this answers the same
    kinds of question across every quiz, class, group and topic a teacher owns,
    and hanging that off a quiz detail route would have made the URL lie about
    what it returns.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "analytics"
