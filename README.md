# Evalio

**A quiz platform that tells students *why* they got it wrong — in their own
teacher's words.**

Django REST Framework + Next.js. Teachers build quizzes from reusable question
banks, assign them to classes, groups or individual students, and read the results;
students sit each quiz once and receive an explanation of every answer they missed.

---

## The problem

Most classroom quiz tools stop at a score. A student finishes, sees **6/10**, and
learns almost nothing: they know *how many* they got wrong, not *what they
misunderstood*. The teacher gets the mirror image of the same gap — a column of
percentages that says something went wrong somewhere, with no indication of where.

Meanwhile the knowledge that would close both gaps already exists. The teacher who
wrote the question knows exactly why each wrong option is tempting, and why it is
wrong. That knowledge is normally spent once, out loud, on whoever asks after the
lesson.

## What Evalio does about it

**Explanations are attached to answer choices, not to questions.**

When a teacher writes a question, each wrong option carries its own short
explanation of why *that particular* mistake is a mistake. When a student submits,
the platform collects the explanations for the specific wrong answers *they*
chose and stitches them into a single readable passage.

Two students who both score 6/10 get different feedback, because they made
different mistakes.

For the teacher, the same data answers the question a score column cannot: a
statistics screen breaks results down by class, subject group, topic, quiz,
individual question and individual student — and shows, per question, **which
distractor pulled people**. One option attracting two-thirds of the room is a named
misconception. One question everybody fails is usually a badly worded question.

### What it deliberately does not do

- **No retakes.** One attempt per student per quiz. A silent second attempt would
  overwrite a score a teacher has already acted on.
- **No correctness feedback during the quiz.** Answers save as you go, but the API
  does not report whether they were right — that would hand over the answer key
  mid-attempt.
- **No open registration for teachers.** Public sign-up always creates a student
  account; teacher accounts are made by an administrator.

---

## How it is built, in one paragraph

Three processes: PostgreSQL in Docker, a Django REST Framework API on `:8000`, and
a Next.js 16 app on `:3000`. The browser never talks to Django — Next.js acts as a
Backend-For-Frontend, holding the JWT in `httpOnly` cookies the browser's JavaScript
cannot read, and calling Django server-to-server. All authorization is enforced in
Django regardless of what the frontend believes.

The design decision that shapes most of the codebase is that **the answer key must
never reach a student**. Serializers come in teacher/student pairs; a submitted
answer stores a *snapshot* of what was asked so a later edit cannot rewrite history;
and the TypeScript types are constructed so that passing a teacher-shaped object
into a student-shaped slot is a compile error, not a runtime leak.

---

## Documentation

Four documents, each answering a different question. They are meant to be read in
whichever order matches what you need.

```
                         README.md   ← you are here
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   SETUP.md          ARCHITECTURE.md        (day-to-day work)
"how do I run it"   "how does it fit          │         │
                      together"               ▼         ▼
                             │           BACKEND.md  FRONTEND.md
                             └──────────────┴─────────┘
```

| Document | Answers | Read it when |
| --- | --- | --- |
| **[docs/SETUP.md](docs/SETUP.md)** | How do I get this running? | First. Assumes only Python, Postgres and Docker are installed; installs everything else step by step, including Node.js. |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | How do the pieces fit together? | Second. The broad map — the three processes, the BFF pattern, the domain model, and the invariants that hold everywhere. Deliberately not detailed. |
| **[docs/BACKEND.md](docs/BACKEND.md)** | What is every model, endpoint and permission? | When changing anything server-side. Full reference for all six Django apps, the security rules, and the query traps. |
| **[docs/FRONTEND.md](docs/FRONTEND.md)** | What is every screen, component and data-fetching rule? | When changing anything client-side. Includes the **[API map](docs/FRONTEND.md#7-frontend--backend-map)** — every route and the endpoints it calls. |

### How they connect

- **SETUP** is self-contained and assumes no knowledge of the other three. Finish it
  and you have a running app with demo data.
- **ARCHITECTURE** is the hub. It explains *why* the system is shaped as it is and
  states the cross-cutting rules; both reference documents assume you have read it
  and expand on one half each.
- **BACKEND** and **FRONTEND** are siblings that meet at one place: the HTTP API.
  BACKEND documents what each endpoint returns and who may call it; FRONTEND's §7
  maps every screen to the endpoints it consumes, so a change on either side can be
  traced to the other in one hop.
- Each of the four also carries a section on **AI-drafted feedback**, covering its
  own half of that design — see below.

---

## Quick start

The full instructions are in [docs/SETUP.md](docs/SETUP.md). The condensed version,
for a machine that already has Python, Docker and Node.js:

```bash
# backend
python -m venv .venv && source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp env_example .env
python scripts/devdb.py            # starts Postgres, migrates, seeds demo data

# frontend
cd frontend && cp env_example .env.local && npm install && cd ..

# run — three terminals
docker compose up -d --wait db
python manage.py runserver                          # :8000
cd frontend && npm run dev                          # :3000
```

Then open <http://localhost:3000>. `scripts/devdb.py` prints every demo account and
its password when it finishes.

---

## Repository at a glance

| Path | What it is |
| --- | --- |
| `accounts/` | Custom `User` with a `role` field; register, login, me |
| `quizzes/` | Topic → QuestionBank → Question → Choice, and Quiz → QuizQuestion |
| `classes/` | Class, Enrollment, TeachingGroup, GroupMembership, QuizAssignment |
| `attempts/` | QuizAttempt and AnswerResponse — a student sitting a quiz |
| `feedback/` | FeedbackResult and the feedback-generation service |
| `analytics/` | Read-only. Owns no models; only ways of querying the others. |
| `frontend/` | The entire Next.js application |
| `scripts/devdb.py` | One command: database up, migrate, seed |
| `docs/` | The four documents above |

**Stack:** Django 6 (`>=6.0.6`) · Django REST Framework · SimpleJWT · PostgreSQL 16 ·
Next.js 16.2.12 · React 19 · TypeScript 6 · Tailwind CSS v4

**Tests:** 208, across six apps. `python manage.py test`

---

## AI-drafted feedback

Teachers can have explanations drafted for them — one choice at a time from the
**Suggest** button, or every gap in a quiz at once — review them, edit them, and
publish. The provider is pluggable — Google AI Studio (Gemini) by default, or a
DeepSeek / OpenAI-compatible endpoint — chosen by one setting. It is **optional and
off by default**: the app, the tests and every existing quiz work identically
without it.

The design turns on one observation. A per-choice explanation depends on the
*content*, not on the student — "why is this answer wrong" is the same sentence
for everyone who picks it — so it can be written **before anyone sits the quiz**.
That means:

- **No model call at runtime.** No student ever waits, nothing can fail
  mid-submit, and cost scales with content authored rather than with traffic.
- **The teacher reads the output first.** Nothing reaches a student unreviewed.
- **Teacher-written text is never touched.** Drafts go in a separate column, the
  generator skips any choice that already has an explanation, and the model is
  never shown the teacher's prose at all.
- **No student data leaves.** The payload is the topic, quiz title, question and
  choices. No names, ids, scores or attempts.
- **A quiz in AI mode cannot be published with a gap**, so a student never meets
  an empty explanation.

Where it is documented:

- [ARCHITECTURE.md § 9](docs/ARCHITECTURE.md#9-ai-drafted-feedback) — why authoring-time, what crosses the boundary, why both texts are snapshotted
- [BACKEND.md § 7](docs/BACKEND.md#ai-drafted-feedback) — models, endpoints, the publish gate, the rules generation obeys
- [FRONTEND.md § 10](docs/FRONTEND.md#10-ai-drafted-feedback) — the authoring UI, and why no student screen changed
- [SETUP.md § 11](docs/SETUP.md#11-ai-drafted-feedback) — the API key, free-tier limits, and running without spending anything
