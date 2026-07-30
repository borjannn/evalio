/**
 * API response shapes, mirroring the DRF serializers exactly.
 *
 * These are hand-written and can drift. When a serializer changes, change this
 * file in the same edit. (The durable fix is drf-spectacular + openapi-typescript
 * so a serializer change breaks this build; not set up yet.)
 *
 * Source of truth per type is named in its docblock.
 */

/* -------------------------------------------------------------------------- */
/* Envelopes                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every list endpoint returns this, not a bare array — PageNumberPagination with
 * PAGE_SIZE = 25. Forgetting `.results` is the most common runtime error in this
 * codebase, so no list type is exported un-enveloped.
 *
 * Exceptions (deliberately unpaginated): none currently. If one appears, note it here.
 */
export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

/* -------------------------------------------------------------------------- */
/* Accounts — accounts/serializers.py                                          */
/* -------------------------------------------------------------------------- */

export type Role = "teacher" | "student";

/** `UserSerializer` — GET /api/auth/me/. Only ever the requesting user's own record. */
export type User = {
  id: number;
  username: string;
  email: string;
  role: Role;
  first_name: string;
  last_name: string;
};

/**
 * `StudentSummarySerializer` — the ONLY shape in which another person's identity
 * is exposed to a teacher. `email` is deliberately absent server-side: rosters and
 * directory search need to tell two students apart, which name + username does,
 * and returning addresses would make any teacher account a contact-list export.
 *
 * No screen can display a student's email, because no endpoint returns one.
 */
export type StudentSummary = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
};

/* -------------------------------------------------------------------------- */
/* Quizzes — quizzes/serializers.py                                            */
/* -------------------------------------------------------------------------- */

export type QuestionType = "mc" | "tf";

/**
 * `ChoiceReadSerializer` — what a student receives. The answer key is absent.
 *
 * The `?: never` members are the security boundary and are NOT decorative.
 * TypeScript is structurally typed, so without them a `TeacherChoice` would be
 * freely assignable to `StudentChoice` — a wider object satisfies a narrower type.
 * Declaring the teacher-only keys as optional-never makes `is_correct: boolean`
 * fail to satisfy `is_correct?: undefined`, so the assignment is rejected.
 *
 * lib/types.guard.ts asserts this and fails the build if these are removed.
 */
export type StudentChoice = {
  id: number;
  text: string;
  is_correct?: never;
  feedback_text?: never;
};

/**
 * `ChoiceWriteSerializer` — teachers only.
 *
 * `feedback_text` is the teacher's explanation of why this choice is wrong, so in
 * practice only incorrect choices carry one. Exposing it identifies the correct
 * answer by elimination. It reaches a student only inside an assembled
 * `FeedbackResult`, after submission.
 */
export type TeacherChoice = {
  id: number;
  text: string;
  is_correct: boolean;
  feedback_text: string;
};

/** `QuestionStudentSerializer`. Carries no bank, author, or timestamps. */
export type StudentQuestion = {
  id: number;
  text: string;
  question_type: QuestionType;
  choices: StudentChoice[];
};

/**
 * `QuestionTeacherSerializer`.
 *
 * `question_bank_name` is read-only (`source="question_bank.name"`). The quiz
 * builder renders questions flat in quiz order, so which bank one came from is
 * only visible as a badge, and a cross-bank search needs the name to label its
 * results — neither can do anything with the id.
 */
export type TeacherQuestion = {
  id: number;
  question_bank: number;
  question_bank_name: string;
  text: string;
  question_type: QuestionType;
  choices: TeacherChoice[];
  created_by: number;
  created_at: string;
};

/**
 * `QuestionTeacherListSerializer` — GET /api/questions/ and the questions nested
 * in a bank detail.
 *
 * The two counts drive the shared-question edit warning. Questions are shared by
 * reference, so editing one changes every quiz that uses it;
 * `submitted_answer_count` covers **submitted** attempts only, since in-progress
 * answers can still change and aren't yet results an edit would invalidate.
 *
 * Separate from `TeacherQuestion` because that shape is what writes use and what
 * the quiz detail endpoint returns, neither of which carries the annotations.
 */
export type TeacherQuestionWithUsage = TeacherQuestion & {
  quiz_usage_count: number;
  submitted_answer_count: number;
};

/** `TopicSerializer`. Shallow by design — quizzes and banks load from their own endpoints. */
export type Topic = {
  id: number;
  name: string;
  /** `blank=True`, never null. Empty string when unset. */
  description: string;
  quiz_count: number;
  question_bank_count: number;
  created_by: number;
  created_at: string;
  updated_at: string;
};

/**
 * `QuestionBankSerializer` — list shape, counts instead of the questions.
 *
 * `questions_in_use_count` is how many of them a quiz already references.
 * Deleting a bank cascades to its questions and so shortens those quizzes; the
 * bank list's delete confirmation says so with this number.
 *
 * ⚠️ Both counts are annotations added by `get_queryset()`, so they exist on
 * list responses only. On the **create** response DRF skips them (a read-only
 * field whose attribute is missing raises `SkipField`, it does not error), which
 * makes this type slightly optimistic for a POST. Callers of `POST
 * /question-banks/` read `id` and nothing else — keep it that way.
 */
export type QuestionBank = {
  id: number;
  topic: number;
  name: string;
  question_count: number;
  questions_in_use_count: number;
  created_at: string;
  updated_at: string;
};

/** `QuestionBankDetailSerializer` — retrieve shape, with the questions. */
export type QuestionBankDetail = {
  id: number;
  topic: number;
  name: string;
  questions: TeacherQuestionWithUsage[];
  created_at: string;
  updated_at: string;
};

/** `QuizSerializer` — list shape. */
export type Quiz = {
  id: number;
  topic: number;
  title: string;
  description: string;
  is_published: boolean;
  created_by: number;
  created_at: string;
};

/**
 * `QuizTeacherListSerializer` — GET /api/quizzes/ as a teacher, and the shape the
 * topic hub lists. Supports `?topic=<id>`.
 *
 * The two counts are annotations and exist only on the teacher branch of
 * `get_queryset()`, which is why this is a separate type from `Quiz` rather than
 * two optional fields: the student list genuinely does not have them.
 */
export type TeacherQuizListItem = Quiz & {
  question_count: number;
  assignment_count: number;
};

/**
 * `QuizDetailTeacherSerializer`. Questions are flattened with their ordering —
 * the builder renders them as one flat sequence, which is what a student will
 * experience, rather than grouped by bank.
 */
export type QuizDetailTeacher = Quiz & {
  questions: QuizBuilderQuestion[];
};

/** One row in the builder: the question, plus where it sits in this quiz. */
export type QuizBuilderQuestion = TeacherQuestion & {
  order: number;
  quiz_question_id: number;
};

/**
 * `QuizStudentListSerializer` — GET /api/quizzes/ as a student, and what §7.1
 * renders.
 *
 * Narrower than `Quiz`, not wider, which is why it doesn't extend it:
 * `is_published` is always true here (only published quizzes reach a student at
 * all) and `created_by` is not the student's business. Both are absent from the
 * payload, so they must be absent from the type.
 *
 * The two attempt ids are the requesting student's own, as scalar subqueries, and
 * are what §7.1's Not started / In progress / Completed is read from. They live
 * here rather than being matched client-side against `GET /attempts/` because
 * that list is paginated at 25: a student with more attempts than that would see
 * finished quizzes reported as untouched.
 *
 * ⚠️ Ids only — no score, no correctness. This shape is read *before* a quiz is
 * taken (§1).
 */
export type StudentQuizListItem = {
  id: number;
  title: string;
  description: string;
  topic_name: string;
  question_count: number;
  /** This student's in-progress attempt, if they have one. At most one exists. */
  open_attempt_id: number | null;
  /** Their most recent submitted attempt, if any. */
  completed_attempt_id: number | null;
  created_at: string;
};

/**
 * `QuizDetailStudentSerializer`. Note the different shape: questions are nested
 * under `quiz_questions`, and there is no `topic`, `is_published`, or author.
 * Not a subset of the teacher shape — don't try to unify them.
 */
export type QuizDetailStudent = {
  id: number;
  title: string;
  description: string;
  quiz_questions: { id: number; question: StudentQuestion; order: number }[];
};

/* -------------------------------------------------------------------------- */
/* Classes — classes/serializers.py                                            */
/* -------------------------------------------------------------------------- */

export type SchoolClass = {
  id: number;
  name: string;
  /** Free text, e.g. "2025/2026". */
  school_year: string;
  student_count: number;
  created_by: number;
  created_at: string;
};

export type Enrollment = {
  id: number;
  student: number;
  student_detail: StudentSummary;
  school_class: number;
  /**
   * Topic names of the subject groups this enrolment is in — the roster's
   * per-student badges. Topic name only, because every group on one roster
   * belongs to the same class.
   */
  group_names: string[];
  created_at: string;
};

export type TeachingGroup = {
  id: number;
  school_class: number;
  class_name: string;
  topic: number;
  topic_name: string;
  member_count: number;
  teacher: number;
  created_at: string;
};

/**
 * Membership points at an `Enrollment`, not a `User` — a student must already be
 * enrolled in the group's class. So a group-roster picker can only offer students
 * already on the class roster; anything else is a 400.
 */
export type GroupMembership = {
  id: number;
  group: number;
  enrollment: number;
  student_detail: StudentSummary;
  created_at: string;
};

export type AssignmentTargetType = "class" | "group" | "student";

/**
 * Exactly one of `school_class` / `group` / `student` is non-null — enforced by a
 * database CheckConstraint, mirrored in the serializer. Sending two or zero is a 400.
 */
export type QuizAssignment = {
  id: number;
  quiz: number;
  school_class: number | null;
  group: number | null;
  student: number | null;
  target_type: AssignmentTargetType;
  target_label: string;
  assigned_by: number;
  assigned_at: string;
};

/**
 * `GET /api/quizzes/{id}/audience/` — who the quiz's assignments reach.
 *
 * Deduplicated: a student in an assigned class who is *also* named individually
 * appears once, with both routes in `via`. That is what lets the assign screen
 * report a trustworthy total and mark an individual as "already covered via 5B"
 * instead of silently no-opping the add.
 *
 * Unpaginated — a bare object, not `Paginated<T>`. `student_count` is the length
 * of `students`, returned so the summary doesn't depend on the client counting.
 *
 * Ignores `is_published`; reach is a property of the assignments, and whether the
 * quiz is a draft is stated separately.
 */
export type QuizAudience = {
  student_count: number;
  students: (StudentSummary & { via: string[] })[];
};

/* -------------------------------------------------------------------------- */
/* Attempts — attempts/serializers.py                                          */
/* -------------------------------------------------------------------------- */

/**
 * `AnswerResponseSerializer`.
 *
 * `is_correct` is **null until the attempt is submitted** — withheld so it can't
 * be read mid-quiz. Treat null as "not knowable yet", never as false.
 *
 * The snapshot fields (`question_text`, `choice_text`, `choice_feedback_text`)
 * exist on the model and are deliberately absent from the serializer. They are
 * not missing from this type by oversight.
 *
 * Both FKs are SET_NULL, so a deleted question or choice leaves null here.
 */
export type AnswerResponse = {
  id: number;
  question: number | null;
  selected_choice: number | null;
  is_correct: boolean | null;
  answered_at: string;
};

export type QuizAttempt = {
  id: number;
  student: number;
  quiz: number;
  quiz_title: string;
  started_at: string;
  /** Null while the attempt is in progress. */
  submitted_at: string | null;
  answers: AnswerResponse[];
};

/**
 * `QuizAttemptListSerializer`. The three score fields are sourced from the related
 * `FeedbackResult`, which only exists after submission — so they are null on an
 * in-progress attempt, even though the underlying model columns are non-null.
 */
export type QuizAttemptListItem = {
  id: number;
  quiz: number;
  quiz_title: string;
  started_at: string;
  submitted_at: string | null;
  score_percent: number | null;
  correct_count: number | null;
  total_count: number | null;
};

/** `TeacherAttemptListSerializer` — GET /api/quizzes/{id}/attempts/. */
export type TeacherAttemptListItem = QuizAttemptListItem & {
  student: number;
  student_username: string;
  student_first_name: string;
  student_last_name: string;
};

/**
 * `AnswerResponseTeacherSerializer` — the teacher half of the pair, and the only
 * shape that carries `AnswerResponse`'s snapshot fields.
 *
 * ⚠️ `choice_feedback_text` must never reach a student. It is the explanation of
 * why a choice is wrong, so in practice only wrong choices have one, and it
 * identifies the correct answer by elimination. There is no student serializer
 * that returns it; keep it that way.
 *
 * The snapshots are what the student actually saw. Both FKs are `SET_NULL`, so
 * `question` and `selected_choice` are null once the underlying row is deleted —
 * which is exactly when the text matters most.
 */
export type TeacherAnswer = {
  id: number;
  question: number | null;
  selected_choice: number | null;
  is_correct: boolean;
  question_text: string;
  choice_text: string;
  choice_feedback_text: string;
  answered_at: string;
};

/** `QuizAttemptTeacherSerializer` — GET /api/attempts/{id}/ as the quiz's author. */
export type TeacherAttemptDetail = {
  id: number;
  student: number;
  quiz: number;
  quiz_title: string;
  student_username: string;
  student_first_name: string;
  student_last_name: string;
  started_at: string;
  submitted_at: string | null;
  answers: TeacherAnswer[];
};

/**
 * `GET /api/quizzes/{id}/results/` — the whole §5.11 screen in one response.
 *
 * **Unpaginated**, like `audience/`: the rows *are* the audience, and a mean
 * score computed over page 1 would be a lie. See Known gaps for the cohort size
 * where that stops being reasonable.
 *
 * `mean_score_percent` is null rather than 0 when nobody has submitted — "no one
 * has finished" and "everyone scored zero" are very different facts.
 *
 * A row with an empty `via` is someone who has an attempt but is no longer
 * assigned; withdrawing an assignment must not erase a result the teacher needs.
 */
export type QuizResults = {
  summary: {
    assigned_count: number;
    submitted_count: number;
    in_progress_count: number;
    not_started_count: number;
    mean_score_percent: number | null;
  };
  /** In quiz order. `answered_count` counts submitted attempts only. */
  questions: {
    id: number;
    text: string;
    order: number;
    answered_count: number;
    correct_count: number;
  }[];
  rows: (StudentSummary & {
    via: string[];
    attempt: TeacherAttemptListItem | null;
  })[];
};

/** Response of POST /api/attempts/{id}/answer/ — deliberately reports no correctness. */
export type AnswerSaved = {
  question_id: number;
  choice_id: number;
  saved: true;
};

/* -------------------------------------------------------------------------- */
/* Feedback — feedback/serializers.py                                          */
/* -------------------------------------------------------------------------- */

/**
 * The assembled passage. This is the only place a student ever legitimately sees
 * teacher-authored explanation text, and only after submitting.
 */
export type FeedbackResult = {
  id: number;
  attempt: number;
  quiz_title: string;
  /** Concatenated per-choice explanations, in quiz order, joined with linking phrases. */
  feedback_text: string;
  score_percent: number;
  correct_count: number;
  total_count: number;
  created_at: string;
};
