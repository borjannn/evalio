# Prototype 1 — what's left, and what's broken

Status as of commit `3201819` (pushed to `origin/master`).

Every screen in `FRONTEND_PLAN.md`'s sitemap now exists and the full loop works end to end —
verified by hand: create a topic → create a quiz → write a question → publish → assign to a class →
sign in as a student in that class → take it → submit → read the feedback → back to the teacher for
the results table and the attempt review.

109 backend tests pass. `ruff`, `npm run lint`, `npm run typecheck` and `npm run build` are all
clean.

What follows is everything that is *not* done, split by whether it stops someone using the product,
and then by whether it is a bug or an absence.

---

## 1. Blocking — the app cannot be used for real without these

### 1.1 ⚠️ No route from registration onto a first roster

**The single thing stopping this being usable by real people.**

`students_visible_to` scopes a teacher's student search to students *already enrolled in one of that
teacher's classes*. That scope is deliberate and correct — without it, any teacher account could
enumerate every student in the system.

The consequence is a chicken-and-egg: a freshly registered student matches nobody's search, so no
teacher can enroll them, so they never become visible. **Today the only way to create a first
enrolment is Django admin.** The roster screen says so rather than looking broken, but that is a
holding message, not a fix.

Three candidate mechanisms, with different exposure profiles:

| Approach | How it works | Exposure |
|---|---|---|
| **Class join code** | Teacher generates a code per class; student redeems it | Anyone with the code joins. Needs expiry/rotation |
| **Invite by exact username** | Teacher types a username in full; exact match only, no fuzzy search | No enumeration, but the teacher must already know the username |
| **Admin-assigned school** | An admin ties teachers and students to a school; search scopes to it | Cleanest model, most setup, needs a new entity |

⛔ **Do not "fix" this by widening the search scope.** That trades a usability problem for a data
protection one.

### 1.2 Teacher list screens silently cap at 25 rows

Every list endpoint is `PageNumberPagination` at 25 with no "return everything" option. `<Pager>`
exists (`frontend/components/ui/pager.tsx`) and the two student screens use it. **Eight teacher
screens do not**, so a teacher with more than 25 of anything sees the first 25 and *nothing on
screen says so*:

- `/teacher` — topics
- `/teacher/topics/[topicId]` — quizzes, banks
- `/teacher/topics/[topicId]/banks` — bank list
- `/teacher/topics/[topicId]/banks/[bankId]` — questions in the bank
- `/teacher/classes` — classes, groups, topics
- `/teacher/classes/[classId]` — enrolments, group memberships
- `/teacher/quizzes/[quizId]/assign` — classes, groups, assignments
- `/teacher/quizzes/[quizId]` — the bank picker's questions

Mostly mechanical: add `?page=` to the fetch and drop `<Pager>` under the list. Two need more
thought — see §3.1 and §3.2.

---

## 2. Bugs that persist

### 2.1 Confirmed

**Bank contents hides questions past the 25th with no indication.**
`/teacher/topics/[topicId]/banks/[bankId]` renders the first page of `/questions/` and shows no
count. The *bank picker* on the builder handles this correctly — it says "Showing 12 of 40 matches.
Narrow the search to see the rest" — but bank contents does not. This is the sharpest instance of
§1.2, because "the question I know exists doesn't come up" is the worst failure a search screen can
have.

**A completed quiz has no retake path in the UI.**
The backend allows unlimited retakes: `attempts/start/` only returns an existing attempt when it is
*unsubmitted*, so calling it again after submission creates a new one. But `/student` shows
"View feedback" for a completed quiz and offers no way to start again. The intro screen at
`/student/quizzes/[quizId]` would create a fresh attempt, and is now reachable only by typing the
URL. So the two halves disagree about whether retaking is a thing. **Needs a product decision, not
just code** — see question Q2.

**`frontend/Guidelines.md` is gitignored but is referenced as the source of truth.**
Both `CLAUDE.md` and `.claude/skills/frontend-route/SKILL.md` point at it for "every colour, size and
component pattern", and it is not in the repository. A fresh clone cannot read it. Either commit it
or stop citing it.

### 2.2 Environment, not application

**The Next dev server corrupts `.next` and serves blank pages.**
Hit twice this session. Symptom: blank white pages, and
`Jest worker encountered 2 child process exceptions, exceeding retry limit` in
`.next/dev/logs/next-development.log`. Both times it followed a `npm run build` overlapping a running
`npm run dev`, or an edit landing mid-HMR. Fix: kill the dev server, `rm -rf .next`, restart. Worth
knowing because it looks exactly like a code bug — a page that renders but is not interactive is
usually this, not hydration.

### 2.3 Suspected, not reproduced

**`/student` appeared stuck on its loading skeleton for several seconds** after a client-side
navigation, including through one hard reload, while the server log showed the route returning
`200` in 333ms. A screenshot taken moments later showed the page rendered correctly and mid-fade. I
could not reproduce it deliberately. Most likely dev-mode compile latency; noted rather than fixed
because I have not proven that.

---

## 3. Known scaling limits (correct today, wrong at scale)

### 3.1 `audience/` and `results/` are unpaginated

Both return one row per student the quiz reaches, deliberately: the assign screen diffs a search
against the whole set, and a mean score computed over page 1 would be a lie. Fine for a few classes,
wrong for a school-wide cohort. Paginating them is a **shape change, not a flag** — the summary and
the per-question stats have to stay whole-set while only the rows page.

### 3.2 The bank picker and bank contents combine search with pagination

`FRONTEND_PLAN` §9 calls this out: filtering re-queries the server and resets to page 1, and the
empty state after a search that matches nothing differs from a bank that is genuinely empty. The
picker gets this right; bank contents does not (§2.1).

---

## 4. Features not built (none blocks a screen)

| Gap | Effect |
|---|---|
| **No due dates** | Assignment has no date field; the student home cannot sort by urgency |
| **No attempt limits** | A student may retake indefinitely — see §2.1 |
| **No choice ordering** | Choices render in creation order; the question form cannot offer drag-to-reorder within a question |
| **No teacher signup** | Registration always creates a student; a second teacher needs `createsuperuser` + admin |
| **No rate limiting** | Login and registration cannot surface a lockout state, because there isn't one |

---

## 5. Housekeeping

- **`app/design/page.tsx`** says in its own docblock: *"delete it when they are done."* They are
  done. Nothing links to it. It currently earns its keep as the only place to see the loading and
  error states side by side — worth keeping only if that is deliberate.
- **`SECRET_KEY` falls back to a hardcoded value** when `DJANGO_SECRET_KEY` is unset. Fine locally,
  must be set in any deployment.
- **`corsheaders` is still configured** for `localhost:3000`. Under the BFF the browser only ever
  talks to same-origin Next route handlers, so it is removable rather than merely outdated.
- **Stray dev data**: a topic named `dsfa` and my test topic `Photosynthesis` are in the local
  database. `python manage.py seed_demo --flush` resets to a clean demo set.
- **`frontend-nextjs-rewrite`** branch at `4715e98` is unpushed and unmerged.

---

## 6. Suggested order

1. **§1.2 pagination** — the only item where the app shows a teacher *wrong* information rather than
   merely incomplete information. Mostly mechanical; start with bank contents.
2. **§1.1 registration → roster** — needs a decision first (Q1 below).
3. **§2.1 retake path** — needs a decision first (Q2 below).
4. §5 housekeeping.
5. §4 features, as wanted.

---

## 7. Questions I need answered

**Q1 — Registration onto a roster (§1.1).** Which mechanism? Join code, invite by exact username, or
an admin-assigned school relation? This determines a schema change, so it is worth settling before
anything is written. My recommendation is **join code**: it needs no new entity, it puts the teacher
in control, and expiry plus rotation is well-understood. Invite-by-username is the smallest change
but only helps when the teacher already knows the username, which is rarely true at the start of a
term.

**Q2 — Retakes (§2.1).** Three coherent options, and the choice changes both screens:
  - **One attempt, enforced.** `start/` refuses once a submitted attempt exists. Simplest, matches
    what the UI already implies.
  - **Unlimited, with a visible path.** Add "Take it again" beside "View feedback", and history
    shows every attempt.
  - **Teacher-controlled.** An `attempt_limit` on the assignment. Most flexible, most work.

**Q3 — Pagination affordance.** `<Pager>` is Previous/Next with "1–25 of 210". Keep that everywhere,
or do you want numbered pages or "Load more" on the card grids? §9 asks for one pattern used
consistently, so I would keep Previous/Next unless you dislike it.

**Q4 — `Guidelines.md` (§2.1).** Commit it, or strip the references to it from `CLAUDE.md` and the
skill? It was gitignored as a "local style spec alongside the reference export", but it has since
become the document the conventions actually cite.

**Q5 — The design page (§5).** Delete it as its docblock instructs, or keep it as a living reference
now that it shows the loading and error states?
