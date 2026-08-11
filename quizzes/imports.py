"""Parse and validate a JSON question import into serializer-ready data.

Kept out of the view so the shape rules — one correct choice, 2-6 choices, a valid
type — are unit-testable without HTTP, and so the view is left to own only the
transaction and the ownership check.

The teacher-facing product here is the **error message**. A JSON import that fails
opaquely is one a teacher cannot fix, so every rejection names the question's
1-based position and what is wrong with it. Validation is pure — it touches no
database — so the whole import can be checked before a single row is written, which
is what lets the endpoint be all-or-nothing.

`feedback` on a choice becomes the teacher's own `feedback_text`: an import is
teacher-authored by definition. It never becomes `ai_feedback_text`, which only the
generation service may write, and it is dropped on the correct choice, which never
carries an explanation.
"""

QUESTION_TYPES = {"mc", "tf"}
MIN_CHOICES = 2
MAX_CHOICES = 6

# A ceiling on one import. Large enough for a whole unit's worth of questions, small
# enough that a pasted mistake can't open a thousand-row transaction.
MAX_IMPORT_QUESTIONS = 100


class QuestionImportError(Exception):
    """One question could not be imported. `index` is 0-based; the caller shows +1."""

    def __init__(self, index, message):
        self.index = index
        self.message = message
        super().__init__(f"question {index}: {message}")


def _question_to_serializer_data(raw, index):
    """Validate one imported question, returning serializer-ready data or raising.

    The bank is not decided here — the view attaches `question_bank` after it has
    resolved and (if new) created the target bank — so this stays a pure check of
    the question's own shape.
    """
    if not isinstance(raw, dict):
        raise QuestionImportError(index, "must be an object with 'text' and 'choices'.")

    text = raw.get("text")
    if not isinstance(text, str) or not text.strip():
        raise QuestionImportError(index, "needs non-empty 'text'.")

    question_type = raw.get("type", "mc")
    if question_type not in QUESTION_TYPES:
        raise QuestionImportError(
            index, "'type' must be 'mc' or 'tf' (defaults to 'mc' if omitted)."
        )

    choices = raw.get("choices")
    if not isinstance(choices, list):
        raise QuestionImportError(index, "needs a 'choices' array.")
    if question_type == "tf" and len(choices) != 2:
        raise QuestionImportError(index, "a true/false question needs exactly 2 choices.")
    if not MIN_CHOICES <= len(choices) <= MAX_CHOICES:
        raise QuestionImportError(
            index, f"needs between {MIN_CHOICES} and {MAX_CHOICES} choices."
        )

    correct_count = 0
    choice_data = []
    for choice in choices:
        if not isinstance(choice, dict):
            raise QuestionImportError(index, "each choice must be an object.")
        choice_text = choice.get("text")
        if not isinstance(choice_text, str) or not choice_text.strip():
            raise QuestionImportError(index, "every choice needs 'text'.")

        is_correct = choice.get("correct", False)
        if not isinstance(is_correct, bool):
            raise QuestionImportError(index, "'correct' must be true or false.")
        if is_correct:
            correct_count += 1

        feedback = choice.get("feedback", "")
        if not isinstance(feedback, str):
            raise QuestionImportError(index, "choice 'feedback' must be a string.")

        choice_data.append(
            {
                "text": choice_text.strip(),
                "is_correct": is_correct,
                # The correct choice never carries an explanation; a wrong one keeps
                # whatever the teacher wrote, or "" for the AI to fill later.
                "feedback_text": "" if is_correct else feedback.strip(),
            }
        )

    if correct_count != 1:
        raise QuestionImportError(
            index, f"must mark exactly one choice correct (found {correct_count})."
        )

    return {
        "text": text.strip(),
        "question_type": question_type,
        "choices": choice_data,
    }


def parse_import(raw_questions):
    """Validate every question up front, returning serializer-ready dicts in order.

    Raises `QuestionImportError` on the first bad question and touches no database,
    so the caller can validate the whole payload before opening a transaction. Each
    dict still lacks `question_bank` — the view fills it once the bank is resolved.
    """
    if not isinstance(raw_questions, list) or not raw_questions:
        raise QuestionImportError(0, "provide a non-empty 'questions' array.")
    if len(raw_questions) > MAX_IMPORT_QUESTIONS:
        raise QuestionImportError(
            0, f"import at most {MAX_IMPORT_QUESTIONS} questions at once."
        )
    return [_question_to_serializer_data(raw, index) for index, raw in enumerate(raw_questions)]
