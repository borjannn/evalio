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
- One sentence or two maximum. Never more than two.
- Do not mention letters or positions ("option B") — choices are reordered.
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


# One call for the whole quiz — the model groups every question into a small number of
# named modules, so a student can later be told how they did per module.
#
# A plain object mapping module name -> the question ids in it, not an array of module
# objects: this is both what the user originally asked for ("a json with objects
# module: {list of questions}") and the only shape that survives OpenAI-compatible
# `response_format={"type": "json_object"}` mode intact. That mode forces the model's
# top-level output to be a JSON *object*; an array-of-{module, question_ids}-objects
# schema left "how do I fit an array inside the object json_object mode demands" open,
# and Qwen resolved it inconsistently — sometimes wrapping the array under a key
# (`{"modules": [...]}`), but at least once by discarding every module but the first
# so the remaining top-level object had a single, flat shape. A name -> ids map has no
# such ambiguity: it already **is** the object json_object mode requires, at the top
# level, with nothing to wrap or collapse.
MODULE_RESPONSE_SCHEMA = {
    "type": "object",
    "additionalProperties": {
        "type": "array",
        "items": {"type": "integer"},
    },
}

MODULE_SYSTEM_TEMPLATE = """\
You are helping a teacher organise a quiz into a small number of topic groups ("modules"),
so a student can be told afterwards how well they did in each area.

Group the questions below into modules: each module is a short name for the skill or
sub-topic its questions test. Reuse a name from existing_modules whenever a group of
questions genuinely belongs there rather than inventing a near-duplicate; only create a
new name when nothing existing fits.

There are exactly {question_count} questions, with ids: {question_id_list}.

Rules:
- Prefer 2-6 modules for the whole quiz. Do not give every question its own module, and do
  not put every question in one module unless the quiz is genuinely that narrow.
- A module name is 2-4 words, title case, and names a topic — never a difficulty
  ("Hard questions"), never a verdict ("Needs work").
- Every one of the {question_count} ids listed above must appear in exactly one module's
  list — none omitted, none repeated, none invented. Before you finish, count the ids
  across every module you are about to return and confirm the total is {question_count};
  if it is not, keep grouping until every id is placed.
- Return a single JSON object whose keys are module names and whose values are the list
  of question ids in that module — for example:
  {{"Water Geography": [12, 7, 3], "City Geography": [4, 9]}}
  This object must have one key for every module you chose — do not return only the
  first module.
- Return only JSON matching the schema.

The quiz follows as JSON.

<question_payload>
{payload}
</question_payload>
"""


def build_module_payload(quiz, questions, existing_modules):
    """The JSON block for the module-grouping call.

    Deliberately excludes choices — grouping is about what topic a question tests, not
    its answer options, so this payload is smaller and cheaper than `build_payload`'s.
    """
    return {
        "quiz": {"title": quiz.title, "description": quiz.description},
        "questions": [{"id": question.id, "text": question.text} for question in questions],
        "question_ids": [question.id for question in questions],
        "existing_modules": [module.name for module in existing_modules],
    }


def build_module_prompt(payload):
    question_ids = payload["question_ids"]
    return MODULE_SYSTEM_TEMPLATE.format(
        question_count=len(question_ids),
        question_id_list=", ".join(str(question_id) for question_id in question_ids),
        payload=json.dumps(payload, indent=2, ensure_ascii=False),
    )
