/**
 * Compile-time assertions for the app's core security property:
 * a teacher-shaped object must never satisfy a student-shaped type.
 *
 * This file has no runtime output. It exists so that `npm run typecheck` fails
 * if someone removes the `?: never` members from `StudentChoice` — which would
 * silently re-open the leak, because TypeScript is structurally typed and a
 * wider object otherwise satisfies a narrower type.
 *
 * Why that matters here specifically: anything a Server Component passes to a
 * Client Component is serialized into the RSC payload and readable in DevTools
 * even when nothing renders it. A student screen that fetches the teacher shape
 * and merely declines to display `is_correct` has still shipped the answer key.
 *
 * See CLAUDE.md and PROJECT_ARCHITECTURE.md.
 */

import type {
  StudentChoice,
  StudentQuestion,
  TeacherChoice,
  TeacherQuestion,
} from "./types";

/** Fails to compile unless T is exactly `false`. */
type AssertFalse<T extends false> = T;
/** Fails to compile unless T is exactly `true`. */
type AssertTrue<T extends true> = T;

type Assignable<Source, Target> = Source extends Target ? true : false;

/* The leak must be rejected --------------------------------------------------- */

export type TeacherChoiceIsNotAStudentChoice = AssertFalse<
  Assignable<TeacherChoice, StudentChoice>
>;

export type TeacherQuestionIsNotAStudentQuestion = AssertFalse<
  Assignable<TeacherQuestion, StudentQuestion>
>;

export type TeacherChoiceArrayIsNotAStudentChoiceArray = AssertFalse<
  Assignable<TeacherChoice[], StudentChoice[]>
>;

/* ...but the genuine student shape must still be accepted, or the guard is
   useless: a type nothing satisfies would also "reject" the leak.  ------------- */

export type StudentShapeStillFits = AssertTrue<
  Assignable<{ id: number; text: string }, StudentChoice>
>;

export type StudentQuestionShapeStillFits = AssertTrue<
  Assignable<
    { id: number; text: string; question_type: "mc"; choices: StudentChoice[] },
    StudentQuestion
  >
>;
