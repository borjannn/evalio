"""The prompt, and the payload that goes with it.

**This is the file to edit when the drafted text is not good.** Nothing downstream
depends on the wording — not a model field, not an endpoint, not a test. Tuning is
a loop over this module and `python manage.py draft_feedback --dry-run`.

Two structural rules live here:

- The teacher's `Topic.feedback_prompt` is **layered onto** this template, never
  substituted for it. The template owns the output format and the structural
  rules; if a teacher's instruction were the whole prompt, one bad edit would
  break JSON parsing for every question in that topic.
- No student ever appears in a payload. Not a name, not a username, not an id, not
  a score. The explanation is about the answer, not about the person, so nothing
  is lost by leaving them out — and minors' data does not go to a third party.
"""

import json

# One call per question. Each entry names a choice and explains it.
RESPONSE_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "choice_id": {"type": "integer"},
            "feedback": {"type": "string"},
        },
        "required": ["choice_id", "feedback"],
    },
}

SYSTEM_TEMPLATE = """\
You are helping a teacher write feedback for a multiple-choice quiz.

For each incorrect choice listed below, write a short explanation a student will
read *after* they have submitted, telling them why that answer is wrong and
pointing them toward the right idea.

Rules:
- Address the student directly, in the second person.
- Explain the misconception, do not merely state the correct answer.
- Be encouraging. The student has already got this wrong; the tone is "here is what
  to look at", never "you should have known".
- Two or three sentences. Never more than four.
- Do not mention letters or positions ("option B") — choices are reordered.
- Do not reveal the correct answer's wording verbatim; describe the idea.
- Write an entry for every id in choice_ids_needing_feedback, and for no other id.
- Return only JSON matching the schema.
{teacher_instructions}
The question follows as JSON.

<question_payload>
{payload}
</question_payload>
"""

# Wrapped in its own marked block so a teacher's instruction can never be mistaken
# for one of the structural rules above, whatever they write in it.
TEACHER_INSTRUCTIONS_TEMPLATE = """
Additional instructions from the teacher about tone and level of detail. Follow
them where they do not conflict with the rules above:

<teacher_instructions>
{instructions}
</teacher_instructions>
"""

DEFAULT_PROMPT_PLACEHOLDER = (
    "e.g. Year 3 pupils, two short sentences, warm and concrete."
)


def build_payload(question, choices, needing_ids, *, topic, quiz=None):
    """The JSON block the model reads. See docs/BACKEND.md §7 for what is excluded.

    Every choice is sent, including the correct one, because "why is this wrong"
    cannot be answered without knowing what right looks like. This is a
    teacher-side call — nothing here reaches a student directly.

    `needing_ids` is passed in rather than derived, because the two callers want
    different sets from the same question: the Suggest button drafts every wrong
    choice, while bulk generation drafts only the ones still blank (D6). The
    validator in `suggestions.py` checks the response against this exact list, so
    narrowing it here narrows what may be written.

    The teacher's own `feedback_text` is **not** sent, even for choices that have
    one. The model never sees teacher prose anywhere in this feature, which is what
    makes "the AI did not touch my writing" a fact about the system rather than a
    promise about its behaviour.
    """
    needing = list(needing_ids)
    return {
        "topic": topic.name,
        "quiz": {"title": quiz.title, "description": quiz.description} if quiz else None,
        "question": question.text,
        "choices": [
            {"id": choice.id, "text": choice.text, "is_correct": choice.is_correct}
            for choice in choices
        ],
        "choice_ids_needing_feedback": needing,
    }


def build_prompt(payload, *, teacher_instructions=""):
    instructions = (teacher_instructions or "").strip()
    block = (
        TEACHER_INSTRUCTIONS_TEMPLATE.format(instructions=instructions)
        if instructions
        else ""
    )
    return SYSTEM_TEMPLATE.format(
        teacher_instructions=block,
        payload=json.dumps(payload, indent=2, ensure_ascii=False),
    )
