"""
Feedback generation.

Replaces the old score-threshold system (FeedbackRule with min/max percent bands).
Feedback is now assembled from the teacher's per-choice explanations: for every
question the student got wrong, the `feedback_text` on the choice they picked is
collected, and those explanations are stitched together with linking words into a
single passage.
"""

from attempts.models import AnswerResponse
from quizzes.models import QuizQuestion

from .models import FeedbackResult

# Prefixed onto each explanation after the first, cycling in order, so the passage
# reads as continuous prose instead of a list of disconnected sentences.
LINKING_PHRASES = (
    "Also,",
    "On top of that,",
    "In addition,",
    "Similarly,",
    "Beyond that,",
    "And finally,",
)

# Explanations often start with a generic sentence opener ("This is wrong because...").
# Those get lowercased when a linking phrase is prepended so the join reads correctly.
# Anything else (a choice name, an acronym, a proper noun) keeps its original casing.
SENTENCE_STARTERS = frozenset(
    {
        "a", "an", "the", "this", "that", "these", "those", "it", "its",
        "you", "your", "here", "there", "while", "since", "because",
        "although", "remember", "if", "when", "picking",
        "choosing", "selecting",
    }
)

PERFECT_SCORE_TEXT = "Everything correct on this one — nice work."
NO_EXPLANATIONS_TEXT = (
    "You missed some questions on this attempt, but your teacher hasn't added "
    "explanations for the answers you picked yet."
)


def _join_with_linking_words(explanations):
    """Stitch explanations into one passage, connecting each with a linking phrase."""
    if not explanations:
        return ""

    passage = [explanations[0].strip()]

    for index, explanation in enumerate(explanations[1:]):
        phrase = LINKING_PHRASES[index % len(LINKING_PHRASES)]
        text = explanation.strip()
        first_word = text.split(" ", 1)[0].rstrip(".,:;").lower()
        if first_word in SENTENCE_STARTERS:
            text = text[0].lower() + text[1:]
        passage.append(f"{phrase} {text}")

    return " ".join(passage)


def generate_feedback(attempt):
    """
    Build (or rebuild) the FeedbackResult for a submitted attempt.

    Questions the student never answered count against the score but contribute no
    explanation — there's no chosen choice to explain. Wrong answers whose choice has
    a blank `feedback_text` are likewise skipped, so a teacher who hasn't filled in
    explanations yet degrades gracefully instead of producing empty filler.

    Explanations come from the snapshot on `AnswerResponse`, not from the live `Choice`,
    so re-running this after a teacher edits the question rebuilds the same passage the
    student originally received.
    """
    question_ids = list(
        QuizQuestion.objects.filter(quiz=attempt.quiz)
        .order_by("order")
        .values_list("question_id", flat=True)
    )
    total_count = len(question_ids)

    # No select_related needed: the explanation is snapshotted onto the answer row at
    # answer time, so nothing here follows a foreign key.
    answers = {
        answer.question_id: answer
        for answer in AnswerResponse.objects.filter(attempt=attempt, question_id__in=question_ids)
    }

    correct_count = 0
    explanations = []

    # Walk in quiz order so the feedback passage follows the order the student saw.
    for question_id in question_ids:
        answer = answers.get(question_id)
        if answer is not None and answer.is_correct:
            correct_count += 1
            continue
        if answer is not None:
            explanation = answer.choice_feedback_text.strip()
            if explanation:
                explanations.append(explanation)

    score_percent = (correct_count / total_count * 100) if total_count else 0.0

    if correct_count == total_count and total_count:
        feedback_text = PERFECT_SCORE_TEXT
    elif explanations:
        feedback_text = _join_with_linking_words(explanations)
    else:
        feedback_text = NO_EXPLANATIONS_TEXT

    result, _ = FeedbackResult.objects.update_or_create(
        attempt=attempt,
        defaults={
            "feedback_text": feedback_text,
            "score_percent": score_percent,
            "correct_count": correct_count,
            "total_count": total_count,
        },
    )
    return result
