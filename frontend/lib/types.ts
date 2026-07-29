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

/** `QuestionTeacherSerializer`. */
export type TeacherQuestion = {
  id: number;
  question_bank: number;
  text: string;
  question_type: QuestionType;
  choices: TeacherChoice[];
  created_by: number;
  created_at: string;
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

/** `QuestionBankSerializer` — list shape, count instead of the questions. */
export type QuestionBank = {
  id: number;
  topic: number;
  name: string;
  question_count: number;
  created_at: string;
  updated_at: string;
};

/** `QuestionBankDetailSerializer` — retrieve shape, with the questions. */
export type QuestionBankDetail = {
  id: number;
  topic: number;
  name: string;
  questions: TeacherQuestion[];
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

/** `QuizDetailTeacherSerializer`. Questions are flattened with their ordering. */
export type QuizDetailTeacher = Quiz & {
  questions: (TeacherQuestion & { order: number; quiz_question_id: number })[];
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
