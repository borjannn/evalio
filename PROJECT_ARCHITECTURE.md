# Evalio - Project Architecture Documentation

## Project Overview

**Evalio** is a Django REST Framework-based educational platform that allows teachers to create and manage quizzes and provides feedback to students based on their quiz performance. The system supports role-based access (Teachers and Students) and uses JWT authentication.

**Tech Stack:**
- Backend: Django 6.0.6 with Django REST Framework
- Authentication: JWT (rest_framework_simplejwt)
- Frontend: React with Vite
- Database: Relational (Django ORM)

---

## Core Data Models & Relationships

### 1. **User (Accounts App)**
The central identity model extending Django's AbstractUser.

**Fields:**
- `username` (string, unique) - User login identifier
- `email` (string, unique) - User email address
- `first_name` (string) - User's first name
- `last_name` (string) - User's last name
- `password` (hashed string) - Securely stored password
- `role` (choice: "teacher" | "student") - User's role in the system
- `is_active` (boolean) - Account status
- `date_joined` (datetime) - Registration timestamp

**Related Objects:**
- `topics` - Topics created by this user
- `modules` - Modules created by this user
- `questions` - Questions created by this user
- `quizzes` - Quizzes created by this user
- `attempts` - Quiz attempts made by this user (if student)
- `feedback_rules` - Feedback rules created by this user (if teacher)

**User Roles:**
- **Teacher**: Can create topics, questions, modules, quizzes, and feedback rules
- **Student**: Can take quizzes and receive feedback

---

### 2. **Topic (Quizzes App)**
A subject/course that organizes quizzes and their question bank.

**Fields:**
- `id` (primary key)
- `name` (string, max 200) - Topic title
- `description` (text, optional) - Topic description
- `created_by` (ForeignKey → User) - Teacher who created it
- `created_at` (datetime) - Creation timestamp
- `updated_at` (datetime) - Last modification timestamp

**Related Objects:**
- `quizzes` - All quizzes belonging to this topic
- `question_bank` - The associated question bank (1-to-1)

**Relationships:**
```
User (Teacher) ──[creates]──> Topic
                              │
                              ├──[contains]──> Quiz
                              └──[has]──> QuestionBank
```

---

### 3. **QuestionBank (Quizzes App)**
A container for all questions related to a specific topic. One-to-one relationship with Topic.

**Fields:**
- `id` (primary key)
- `topic` (OneToOneField → Topic) - Associated topic
- `created_at` (datetime) - Creation timestamp
- `updated_at` (datetime) - Last modification timestamp

**Related Objects:**
- `questions` - All questions in this bank

**Purpose:** Centralizes question management for a topic, allowing questions to be reused across multiple quizzes.

---

### 4. **Module (Quizzes App)**
A hierarchical organizational unit representing course sections/chapters. Can have sub-modules.

**Fields:**
- `id` (primary key)
- `name` (string, max 200) - Module name
- `description` (text, optional) - Module description
- `parent` (ForeignKey → Module, nullable) - Parent module for hierarchy
- `created_by` (ForeignKey → User) - Teacher who created it
- `created_at` (datetime) - Creation timestamp

**Related Objects:**
- `submodules` - Child modules
- `questions` - Questions belonging to this module
- `feedback_rules` - Feedback rules for this module
- `feedback_results` - Generated feedback results for this module

**Hierarchy Example:**
```
Module: "Mathematics"
├── Module: "Algebra"
│   └── Module: "Linear Equations"
├── Module: "Geometry"
│   └── Module: "Shapes"
```

---

### 5. **Question (Quizzes App)**
An individual assessment item with multiple choice or true/false format.

**Fields:**
- `id` (primary key)
- `question_bank` (ForeignKey → QuestionBank) - Which question bank this belongs to
- `module` (ForeignKey → Module) - Which module this question covers
- `text` (text) - The question content
- `question_type` (choice: "mc" | "tf") - Multiple Choice or True/False
- `created_by` (ForeignKey → User) - Teacher who created it
- `created_at` (datetime) - Creation timestamp

**Related Objects:**
- `choices` - Answer options for this question
- `quizzes` - Quizzes that include this question

**Relationship Diagram:**
```
QuestionBank ──[contains]──> Question
                              │
                              ├──[covers]──> Module
                              ├──[has]──> Choice
                              └──[used in]──> Quiz (via QuizQuestion)
```

---

### 6. **Choice (Quizzes App)**
An answer option for a multiple-choice or true/false question.

**Fields:**
- `id` (primary key)
- `question` (ForeignKey → Question) - Associated question
- `text` (string, max 255) - The choice text
- `is_correct` (boolean) - Whether this is the correct answer

**Security Note:** `is_correct` is hidden from students via role-based serializers. Teachers see it, students don't.

---

### 7. **Quiz (Quizzes App)**
A collection of questions organized for assessment.

**Fields:**
- `id` (primary key)
- `topic` (ForeignKey → Topic) - Which topic this quiz is for
- `title` (string, max 200) - Quiz name
- `description` (text, optional) - Quiz description
- `created_by` (ForeignKey → User) - Teacher who created it
- `questions` (ManyToManyField → Question via QuizQuestion) - Questions in this quiz
- `created_at` (datetime) - Creation timestamp

**Related Objects:**
- `attempts` - All attempts/submissions of this quiz

**Relationship Diagram:**
```
Topic ──[contains]──> Quiz ──[references]──> Question
                       │           ↑
                       │           │
                       └─[via QuizQuestion with order]
                              │
                              └──> Module (questions cover specific modules)
```

---

### 8. **QuizQuestion (Quizzes App)**
A junction/through model linking Quiz and Question with ordering.

**Fields:**
- `id` (primary key)
- `quiz` (ForeignKey → Quiz) - Which quiz
- `question` (ForeignKey → Question) - Which question
- `order` (positive integer) - Display order in the quiz

**Constraints:**
- Unique together: (quiz, question) - Prevents duplicate questions in a quiz
- Ordered by: `order` field

**Purpose:** Maintains the sequence of questions within a quiz while allowing question reuse across multiple quizzes.

---

### 9. **QuizAttempt (Attempts App)**
Represents a student's attempt to complete a quiz.

**Fields:**
- `id` (primary key)
- `student` (ForeignKey → User) - The student taking the quiz
- `quiz` (ForeignKey → Quiz) - Which quiz they're attempting
- `started_at` (datetime) - When the attempt began (auto-set)
- `submitted_at` (datetime, nullable) - When the attempt was submitted (null = in progress)

**Related Objects:**
- `answers` - All answer responses for this attempt
- `feedback_results` - Feedback generated for this attempt

**Status Tracking:**
- In Progress: `submitted_at` is null
- Completed: `submitted_at` has a timestamp

---

### 10. **AnswerResponse (Attempts App)**
A student's answer to a specific question in a quiz attempt.

**Fields:**
- `id` (primary key)
- `attempt` (ForeignKey → QuizAttempt) - Which attempt this is part of
- `question` (ForeignKey → Question) - Which question is being answered
- `selected_choice` (ForeignKey → Choice, nullable) - The chosen answer
- `is_correct` (boolean) - Auto-calculated based on choice correctness
- `answered_at` (datetime) - When the answer was submitted (auto-set)

**Constraints:**
- Unique together: (attempt, question) - Only one answer per question per attempt
- Auto-validation: `is_correct` is automatically set based on `selected_choice.is_correct`

**Data Flow:**
```
Student selects answer
    ↓
AnswerResponse created with selected_choice
    ↓
is_correct automatically populated from selected_choice.is_correct
    ↓
Used for scoring and feedback generation
```

---

### 11. **FeedbackRule (Feedback App)**
Teacher-defined rules for generating feedback based on performance in a specific module.

**Fields:**
- `id` (primary key)
- `module` (ForeignKey → Module) - Which module this rule applies to
- `min_score` (positive integer) - Inclusive lower bound (percentage 0-100)
- `max_score` (positive integer) - Inclusive upper bound (percentage 0-100)
- `feedback_text` (text) - The feedback message to show
- `created_by` (ForeignKey → User) - Teacher who created the rule

**Ordering:** By module and min_score

**Example:**
```
Module: "Linear Equations"
├── Rule: 0-49% → "You need to review the basics..."
├── Rule: 50-74% → "Good effort, but practice more..."
└── Rule: 75-100% → "Excellent work on this module!"
```

---

### 12. **FeedbackResult (Feedback App)**
The generated feedback given to a student after attempting a quiz.

**Fields:**
- `id` (primary key)
- `attempt` (ForeignKey → QuizAttempt) - Which attempt this feedback is for
- `module` (ForeignKey → Module) - Which module the feedback covers
- `score_percent` (float) - Percentage score on that module (0-100)
- `feedback_text` (text) - The actual feedback message
- `source` (choice: "rule" | "llm") - Whether rule-based or AI-generated
- `created_at` (datetime) - When feedback was generated

**Constraints:**
- Unique together: (attempt, module) - One feedback per module per attempt

**Source Types:**
- `"rule"` - Matched a FeedbackRule
- `"llm"` - Generated by an AI model

---

## Data Flow Diagrams

### Quiz Creation Flow (Teacher)
```
Teacher creates Topic
    ↓
System auto-creates QuestionBank for Topic
    ↓
Teacher creates Modules (hierarchical)
    ↓
Teacher creates Questions in QuestionBank
    ├─ Each Question references a Module
    └─ Each Question has multiple Choices
    ↓
Teacher creates Quiz in Topic
    ├─ Selects Questions to include
    └─ System creates QuizQuestion entries with order
    ↓
Teacher (optionally) creates FeedbackRules for Modules
```

### Quiz Attempt Flow (Student)
```
Student views available Quizzes
    ↓
Student starts Quiz
    └─> QuizAttempt created (started_at = now, submitted_at = null)
    ↓
System serves Quiz details to student
    ├─ Questions with Choices
    └─ Correct answers are hidden
    ↓
Student answers Questions
    ├─ AnswerResponse created for each question
    ├─ selected_choice is stored
    └─ is_correct is auto-calculated
    ↓
Student submits Quiz
    └─> QuizAttempt.submitted_at = now
    ↓
System calculates Module scores
    ├─ Group answers by Question.module
    ├─ Calculate % correct per module
    └─ Create FeedbackResults
    ↓
Student receives Feedback per Module
    ├─ Matches FeedbackRule by score range
    └─ OR generates via LLM
```

### Score Calculation Logic
```
For each Module in the quiz:
    1. Find all Questions in this quiz that belong to this Module
    2. Find AnswerResponses for those Questions in this attempt
    3. Count correct_count / total_count
    4. Score = (correct_count / total_count) × 100
    5. Look up matching FeedbackRule by score range
    6. Create FeedbackResult with matched or LLM feedback
```

---

## API Endpoint Summary

### Authentication (Accounts)
- `POST /api/auth/register/` - Student/Teacher registration
- `POST /api/auth/login/` - JWT token generation
- `POST /api/auth/refresh/` - Refresh JWT token
- `GET /api/auth/me/` - Current user profile

### Topics & Question Banks (Teacher)
- `GET /api/topics/` - List topics
- `POST /api/topics/` - Create topic
- `GET /api/topics/{id}/` - Topic detail + quizzes + question bank
- `PUT /api/topics/{id}/` - Update topic

### Modules (Teacher)
- `GET /api/modules/` - List modules
- `POST /api/modules/` - Create module (with optional parent)
- `PUT /api/modules/{id}/` - Update module

### Questions (Teacher)
- `POST /api/question-banks/{id}/questions/` - Create question with choices
- `PUT /api/questions/{id}/` - Update question with choices
- `DELETE /api/questions/{id}/` - Delete question

### Quizzes (Teacher)
- `GET /api/quizzes/` - List quizzes
- `POST /api/quizzes/` - Create quiz
- `GET /api/quizzes/{id}/` - Quiz detail with questions and choices (teacher view)
- `PUT /api/quizzes/{id}/` - Update quiz
- `POST /api/quizzes/{id}/add-questions/` - Add questions to quiz

### Quizzes (Student)
- `GET /api/quizzes/` - List available quizzes
- `GET /api/quizzes/{id}/start/` - Quiz detail for attempt (student view, no answers)

### Quiz Attempts (Student)
- `POST /api/attempts/` - Start new quiz attempt
- `GET /api/attempts/{id}/` - View attempt with answers submitted so far
- `POST /api/attempts/{id}/submit-answer/` - Submit individual answer
- `POST /api/attempts/{id}/submit/` - Complete attempt and get feedback

### Feedback
- `GET /api/attempts/{attempt_id}/feedback/` - Get feedback results for an attempt
- `GET /api/feedback-rules/` - List feedback rules (teacher only)
- `POST /api/feedback-rules/` - Create feedback rule (teacher only)

---

## Role-Based Access Control

### Teacher Permissions
- ✅ Create/edit/delete Topics
- ✅ Create/edit/delete Modules
- ✅ Create/edit/delete Questions and Choices (with correct answers visible)
- ✅ Create/edit/delete Quizzes
- ✅ Create/edit/delete Feedback Rules
- ✅ View all quiz attempts and student answers
- ✅ View aggregate class analytics

### Student Permissions
- ✅ View available Quizzes
- ✅ Start Quiz attempts
- ✅ Submit answers (questions and choices visible, but correct answers hidden)
- ✅ View feedback after completing quiz
- ✅ View their own attempt history
- ❌ Cannot see correct answers while quiz is in progress
- ❌ Cannot create or edit any content

---

## Key Design Patterns

### 1. **Soft Question Reusability**
Questions are stored in a QuestionBank and linked to Quizzes via QuizQuestion. This allows:
- Same question to appear in multiple quizzes
- Question order to be customized per quiz
- Efficient question reuse and management

### 2. **Role-Based Serializers**
Different serializers for Teachers vs Students:
- **ChoiceWriteSerializer** (Teachers): Includes `is_correct`
- **ChoiceReadSerializer** (Students): Hides `is_correct`
- **QuestionTeacherSerializer**: Full details
- **QuestionStudentSerializer**: Limited to needed fields
- **QuizDetailTeacherSerializer**: Includes all questions with answers
- **QuizDetailStudentSerializer**: Only questions, no answers

### 3. **Auto-Calculated Fields**
`AnswerResponse.is_correct` is automatically calculated from the selected choice, ensuring data consistency.

### 4. **Module-Based Feedback**
Feedback is generated per-module, allowing targeted feedback on specific topics rather than just a single overall score.

### 5. **Flexible Feedback Sources**
Feedback can come from:
- **Rule-based**: Teacher-defined rules (deterministic)
- **LLM**: AI-generated (intelligent, personalized)

---

## Frontend Considerations

### Key Screens for Frontend Design

**For Students:**
1. **Quiz List** - Browse available quizzes by topic
2. **Quiz Start** - Confirm start, show quiz title/description
3. **Quiz Taking Interface** - Display questions one-by-one or all, show progress
4. **Quiz Submission** - Confirm submission, show summary
5. **Feedback View** - Display per-module feedback and scores
6. **Attempt History** - View previous attempts and feedback

**For Teachers:**
1. **Dashboard** - Overview of topics, quizzes, student activity
2. **Topic Management** - Create/edit topics
3. **Module Management** - Create hierarchical module structure
4. **Question Bank** - Create/edit/delete questions with choices
5. **Quiz Builder** - Create quizzes by selecting questions
6. **Feedback Rules** - Define score-based feedback rules
7. **Class Analytics** - View student performance, attempt data

---

## Summary of Model Relationships

```
┌─────────────────────────────────────────────────────┐
│                      USER                           │
│  (Teacher or Student)                              │
└────┬───────────┬────────┬───────────────┬───────────┘
     │           │        │               │
     ├─creates→  │        │               │
     │      TOPIC│        │               │
     │           ├─has→   │               │
     │           │   QUESTIONBANK         │
     │           │        │               │
     │           │        ├─contains→    │
     │           │        │   QUESTION ──┼──┼──┼──→  MODULE
     │           │        │        │     │  │  │
     │           │        │        │     │  │  └─→ CHOICE
     │           │        │        │     │  │
     │           │        └─uses──→│     │  │
     │           │            QUIZ ──┼──│──┼──→ QUIZQUESTION
     │           │            │     │  │  │
     │           │            └────→  │  │
     │           │                    │  │
     └────starts→ QUIZATTEMPT ←───answers─ ANSWERRESPONSE
                  │
                  └─generates→ FEEDBACKRESULT
                               │
                               ├─matched from→ FEEDBACKRULE ←creates─ User
                               └─covers→ MODULE
```

---

## Database Schema Summary

| App | Model | Purpose |
|-----|-------|---------|
| accounts | User | Authentication and role management |
| quizzes | Topic | Course/subject grouping |
| quizzes | Module | Hierarchical topic organization |
| quizzes | QuestionBank | Container for all questions in a topic |
| quizzes | Question | Individual assessment items |
| quizzes | Choice | Answer options for questions |
| quizzes | Quiz | Collection of questions for assessment |
| quizzes | QuizQuestion | Junction table linking Quiz and Question |
| attempts | QuizAttempt | Student's quiz submission |
| attempts | AnswerResponse | Student's answer to a question |
| feedback | FeedbackRule | Teacher-defined feedback templates |
| feedback | FeedbackResult | Generated feedback for a student |

---

## Important Implementation Notes

1. **Cascading Deletes**: Most models cascade delete on User, so deleting a teacher deletes all their content.

2. **Ordering**: Questions within a quiz maintain order via QuizQuestion.order, and feedback results are ordered by module and score range.

3. **Answer Validation**: The `AnswerResponse.save()` method automatically validates answers by checking choice correctness.

4. **JWT Authentication**: All endpoints use JWT tokens. Students can only see their own attempts; teachers can see all attempts.

5. **Timeline**: Attempts track `started_at` and `submitted_at`, allowing the system to know which quizzes are in-progress vs. completed.

6. **Module Hierarchy**: Modules can have parents, creating a tree structure for organizing course content hierarchically.

This architecture supports scalability, role-based access, flexible question management, and intelligent feedback generation.

