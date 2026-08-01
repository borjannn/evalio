# Evalio — Setup Guide

Getting Evalio running on a clean machine, from nothing to a working app with
demo data in it.

**This guide assumes you have exactly three things installed: Python, PostgreSQL
and Docker.** Everything else — Django, Node.js, npm, the Python packages, the
JavaScript packages — is installed along the way and is called out explicitly.

Read §0 first; the two-minute version is at the bottom in §11 once you have done
it once.

---

## 0. Before you start — three things to know

**1. You will not use your local PostgreSQL install.**
Evalio runs Postgres in a Docker container, defined by `docker-compose.yml`. That
guarantees everyone gets the same version (16) with the same settings.

> ⚠️ **If you have PostgreSQL running locally it will occupy port 5432 and the
> container will fail to start.** Stop your local service before continuing, or
> change the host port in `docker-compose.yml`. See §10.

**2. Django is not installed yet.**
"Having Python" means you have the interpreter. Django, Django REST Framework and
everything else arrive in §3 via `pip install -r requirements.txt`.

**3. Node.js is not in your list, and the frontend needs it.**
§6 installs it. `npm` comes bundled with Node.js — you do not install it separately.

---

## 1. Verify your prerequisites

Run these three commands. All three must succeed before you go on.

```bash
python --version        # need 3.12 or newer  (Windows: try `py --version`)
docker --version
docker compose version  # note: a space, not `docker-compose`
```

| Requirement | Minimum | Why |
| --- | --- | --- |
| Python | **3.12+** | Django 6 requires it. This project is developed on 3.14. |
| Docker | any current | Runs the PostgreSQL container |
| Docker Compose | v2 (`docker compose`) | The `docker-compose.yml` uses v2 syntax |

**Docker must actually be running**, not merely installed. On Windows and macOS
that means Docker Desktop is open. Check with:

```bash
docker info
```

If that errors with "cannot connect to the Docker daemon", start Docker Desktop and
wait for it to say *Running*, then try again.

---

## 2. Get the code

```bash
git clone <your-repository-url> evalio
cd evalio
```

Every command from here on is run **from the repository root** (the folder
containing `manage.py`) unless it explicitly says otherwise.

---

## 3. Set up Python and install the backend

### 3.1 Create a virtual environment

A virtual environment keeps Evalio's packages separate from your system Python.
Skipping it is the most common cause of "it works on my machine" problems.

**macOS / Linux**
```bash
python -m venv .venv
source .venv/bin/activate
```

**Windows PowerShell**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**Windows Git Bash**
```bash
python -m venv .venv
source .venv/Scripts/activate
```

Your prompt should now be prefixed with `(.venv)`. If PowerShell refuses with an
execution-policy error, run this once and then retry:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

> **You must activate the virtual environment in every new terminal** before
> running any `python manage.py` command. If you get `ModuleNotFoundError: No
> module named 'django'`, this is almost always why.

### 3.2 Install the dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

That installs Django, Django REST Framework, SimpleJWT, `django-cors-headers`,
`python-dotenv`, the `psycopg` PostgreSQL driver, and `ruff` (the linter).

Verify:

```bash
python -c "import django; print(django.get_version())"
```

You should see `6.0.x`.

---

## 4. Configure the backend environment

Django reads its database settings from environment variables **with no
fallbacks** — it will refuse to start without them. This is deliberate: a silent
fallback to SQLite would let migrations quietly diverge from the real database.

Copy the template:

**macOS / Linux / Git Bash**
```bash
cp env_example .env
```

**Windows PowerShell**
```powershell
Copy-Item env_example .env
```

The file you now have:

```ini
POSTGRES_DB=evalio
POSTGRES_USER=evalio_user
POSTGRES_PASSWORD=evalio_pass
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

**Leave these values alone for local development.** They match the credentials
`docker-compose.yml` creates the container with; changing one without changing the
other will break the connection.

`.env` is gitignored and must never be committed.

---

## 5. Start the database and initialise it

There is one command for this, and it does the three steps in the right order:

```bash
python scripts/devdb.py
```

It will:

1. **Start Postgres** — `docker compose up -d --wait db`. The `--wait` blocks on
   the healthcheck in `docker-compose.yml`, so the next step cannot race a
   container that is *running* but not yet *accepting connections*.
2. **Apply migrations** — `python manage.py migrate`, creating every table.
3. **Seed demo data** — `python manage.py seed_demo`, which creates an admin, two
   teachers, eight students, topics with named banks, questions carrying real
   explanations, a published and a draft quiz, classes with a subject group, all
   three assignment target types, and four attempts in different states.

It prints every account's password at the end. **Note them down** — you need one to
sign in.

### Variants

```bash
python scripts/devdb.py --fresh    # destroy the volume first: a genuinely empty database
```

Without `--fresh` the seed re-runs with `--flush`, which is idempotent: it deletes
only the demo accounts and what cascades from them, so unrelated rows you have
created survive.

### If you would rather run the steps by hand

```bash
docker compose up -d --wait db
python manage.py migrate
python manage.py seed_demo --flush
```

### Optional — a much larger dataset

The demo data is small on purpose: every row exists to make one screen legible.
To see the app under realistic volume (720 students, 7 classes, 31 quizzes, ~850
submitted attempts), which is what makes the statistics screen and pagination
worth looking at:

```bash
python manage.py seed_bulk
python manage.py seed_bulk --flush     # replace a previous bulk run
python manage.py seed_bulk --scale 0.3 # a third of the attempts, for a fast rebuild
```

The two seeders use different email domains and coexist happily; `--flush` on
either only removes its own accounts.

---

## 6. Install Node.js

The frontend needs Node.js. **npm ships with it** — there is no separate install.

Download the **LTS** build from <https://nodejs.org> and run the installer, or use a
package manager:

```bash
# macOS
brew install node

# Windows (winget)
winget install OpenJS.NodeJS.LTS

# Debian / Ubuntu — the distro package is usually too old
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verify, in a **new** terminal (the installer changes your PATH):

```bash
node --version    # v20 or newer
npm --version
```

Next.js 16 requires Node 20.9+. Node 22 LTS is a safe choice.

---

## 7. Set up the frontend

All commands in this section run from the `frontend/` directory.

```bash
cd frontend
```

### 7.1 Environment

```bash
cp env_example .env.local              # PowerShell: Copy-Item env_example .env.local
```

Which gives you:

```ini
DJANGO_API_URL=http://localhost:8000/api
```

> **This variable is deliberately not prefixed `NEXT_PUBLIC_`.** A `NEXT_PUBLIC_`
> variable is inlined into the JavaScript bundle sent to the browser. This URL is
> only ever used server-side, by `lib/api.ts` — the browser never talks to Django
> directly. Renaming it would be a security regression, not a convenience.

The frontend **throws at import time** if this is missing, with a message telling
you to copy the file. That is intentional — it fails immediately and clearly rather
than producing a request to `undefined/topics/` later.

### 7.2 Install the JavaScript dependencies

```bash
npm install
```

This reads `package.json` and installs Next.js, React, TypeScript, Tailwind CSS v4
and `lucide-react` into `frontend/node_modules/`. It takes a minute or two the first
time.

> ⚠️ **Do not run `npm install typescript`.** TypeScript is pinned to `^6` in
> `package.json` for a reason: Next 16's built-in type checker cannot use TS 7, and
> `@typescript-eslint` peer-requires `<6.1.0`. A bare install would pull 7.x and
> break `next build`.

---

## 8. Run it

You need **three things running at once**: the database container, the Django API,
and the Next.js server. The order matters — each depends on the one before.

### Terminal 1 — the database

Already running from §5. Confirm:

```bash
docker compose ps
```

You want `evalio_db` with state `running (healthy)`. If not:

```bash
docker compose up -d --wait db
```

### Terminal 2 — the backend

From the repository root, **with the virtual environment activated**:

```bash
python manage.py runserver
```

Serves on <http://localhost:8000>. Leave it running.

Sanity check in another terminal — a `401` here is the **correct** answer, because
the endpoint requires authentication and you have not sent a token:

```bash
curl -i http://localhost:8000/api/topics/
```

### Terminal 3 — the frontend

From `frontend/`:

```bash
npm run dev
```

Serves on <http://localhost:3000>. Leave it running.

### Open the app

Go to **<http://localhost:3000>** and sign in with one of the accounts
`scripts/devdb.py` printed.

| Try | Account |
| --- | --- |
| The teacher side | the teacher username from the seed output |
| A perfect score and its feedback | the first student account |
| A mixed result with a real feedback passage | the second student account |

The Django admin is at <http://localhost:8000/admin/> using the admin account.

---

## 9. Everyday commands

Once set up, this is the whole loop.

### Starting work

```bash
# terminal 1 (repo root)
source .venv/bin/activate          # Windows: .\.venv\Scripts\Activate.ps1
docker compose up -d --wait db
python manage.py runserver

# terminal 2
cd frontend && npm run dev
```

### Backend

```bash
python manage.py test                # all 195 tests (needs the database up)
python manage.py test attempts       # one app
python manage.py makemigrations      # after changing a model
python manage.py migrate
python manage.py createsuperuser     # then set role="teacher" in /admin/
ruff check .                         # lint
ruff check . --fix
```

### Frontend

```bash
cd frontend
npm run lint
npm run typecheck                    # runs `next typegen` first — required
npm run build                        # catches bundler-only errors the other two miss
```

> Run `npm run build` before considering frontend work finished. Some rules — most
> notably "a `"use server"` module may export only async functions" — are enforced
> by the bundler and are reported by neither `tsc` nor eslint.

### Stopping

`Ctrl-C` in the two server terminals, then:

```bash
docker compose stop db      # keeps your data
docker compose down         # removes the container, keeps the volume
docker compose down -v      # removes the data too — you will need to re-seed
```

### Creating a teacher account

Public registration **always creates a student** — that is a security property, not
an oversight. To make a teacher:

```bash
python manage.py createsuperuser
```

Then open <http://localhost:8000/admin/>, find the user under **Accounts → Users**,
set **Role** to `Teacher`, and save.

---

## 10. Troubleshooting

**`ModuleNotFoundError: No module named 'django'`**
The virtual environment is not activated in this terminal. Run the activate command
from §3.1.

**`No .env at the repo root` when running `devdb.py`**
You skipped §4. `cp env_example .env`.

**`docker compose up` fails with "port 5432 is already allocated"**
Something else is on that port — almost always a locally installed PostgreSQL
service. Either stop it:

```bash
# macOS (Homebrew)
brew services stop postgresql
# Linux
sudo systemctl stop postgresql
# Windows (as Administrator)
Stop-Service postgresql-x64-16
```

…or change the host-side port in `docker-compose.yml` (`"5433:5432"`) **and** set
`POSTGRES_PORT=5433` in `.env`. Both, or nothing will connect.

**`django.db.utils.OperationalError: could not connect to server`**
The container is not up or not ready yet. `docker compose ps` should show
`running (healthy)`. If it is starting, wait — or use
`docker compose up -d --wait db`, which blocks until it is ready.

**`error during connect: … dockerDesktopLinuxEngine`**
Docker Desktop is not running. Start it and wait for *Running*.

**Frontend: `DJANGO_API_URL is not set`**
You skipped §7.1. `cp env_example .env.local` inside `frontend/`, then restart
`npm run dev` — environment files are read at server start.

**Frontend builds but every page redirects to `/login`**
The Django server is not running, so the session check fails. Check terminal 2.

**`npm run typecheck` fails on a clean checkout with missing `PageProps`**
Route types have not been generated yet. `npm run typecheck` runs `next typegen`
first for this reason — a bare `tsc --noEmit` will not work.

**The tests take about ten minutes**
Expected. PBKDF2 password hashing dominates fixture setup. A test-only
`PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]` override
typically brings it under a minute.

**Everything is broken and you want to start over**

```bash
docker compose down -v          # destroys the database volume
python scripts/devdb.py --fresh # recreate, migrate, seed
```

---

## 11. AI-drafted feedback

**Optional, and off by default.** Everything in the app works without any of
this — teacher-written feedback is unaffected, the whole test suite passes, and
nothing reaches the network. Skip this section entirely if you do not want it.

No extra process. Nothing runs beside the three in §8: drafting is a request a
teacher makes from the quiz builder, never a background worker and never anything
that happens while a student is submitting.

### 11.1 Getting a key

1. Sign in at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and
   create a key.
2. Put it in `.env` — the same gitignored file as the `POSTGRES_*` block:

```ini
GOOGLE_AI_API_KEY=your-key-here
GEMINI_MODEL=gemini-3.6-flash
AI_FEEDBACK_ENABLED=true
```

> ⚠️ **Check the model still exists before trusting whatever is written here.**
> Google retires models to new keys while continuing to list them, and the failure
> arrives as a 404 on your first real call — *"no longer available to new users"*.
> `gemini-2.5-flash` was already in that state by the time this feature was built.
> Ask your key what it can actually use:
>
> ```python
> # python manage.py shell
> from django.conf import settings
> from google import genai
> client = genai.Client(api_key=settings.GOOGLE_AI_API_KEY)
> [m.name for m in client.models.list() if "generateContent" in (m.supported_actions or [])]
> ```
>
> `gemini-flash-latest` is an alias that tracks the current flash model and never
> goes stale, at the cost of the model changing under you without a code change.

`env_example` carries all of these with blank values and comments.

> ⚠️ Server-side only. Never prefix any of them with `NEXT_PUBLIC_` and never read
> them from the browser — a `NEXT_PUBLIC_` variable is inlined into the client
> bundle, which for an API key means publishing it. `frontend/.env.local` needs
> nothing.

### 11.2 Check your key's actual limits

Open the rate-limits page in AI Studio and read the row for the model you set.
The free tier is small enough to matter: at the time of writing, `gemini-2.5-flash`
free allows **5 requests per minute and 20 per day**.

Drafting makes **one call per question**, so 20 per day is one medium quiz — and a
prompt-tuning session will exhaust it faster than that. Enabling billing on the
key removes the constraint; the cost of a few hundred two-sentence explanations on
Flash is a rounding error, and it changes no code.

Set the pacer from what you actually read:

```ini
AI_FEEDBACK_RPM=5            # the quota. The pacer holds every run under it.
AI_FEEDBACK_CONCURRENCY=2    # how many questions are in flight at once.
```

These are not the same knob. Concurrency is how many workers there are; RPM is the
quota, enforced on the calls themselves, so raising concurrency alone can never
breach it.

### 11.3 Running without spending anything

Three separate guarantees, in order of how much you have to remember:

| | |
| --- | --- |
| **Tests** | Impossible to spend a token. `evalio/testrunner.py` forces the fake provider for the entire suite. |
| **`--fake`** | `python manage.py draft_feedback --quiz N --fake` exercises the whole path — payload, validation, writes — with no API call. |
| **`AI_FEEDBACK_ENABLED=false`** | The default. Endpoints answer 503 with a clear message; nothing else changes. |

### 11.4 Tuning the prompt before you rely on it

The wording in `feedback/prompts.py` is the only thing that decides whether the
output is any good, and nothing downstream depends on it — no model field, no
endpoint, no test. Read the output before building habits on it:

```
python manage.py draft_feedback --quiz N --limit 3    # 3 calls, writes nothing
```

`--limit` is there because a tuning run wants three explanations, not forty. The
seeded data gives you both ends of the range on purpose: *Computer Hardware*
carries a Year 5 instruction and *Mathematics 1* a secondary-level one, so you can
see whether the topic prompt is actually changing the voice.

Add `--write` when you are happy, or use the **Draft** button on the quiz builder.

### 11.5 One thing worth knowing

On Google's **free** tier, prompts and responses may be used to improve their
products; paid tiers do not. No student data ever leaves — the payload is the
topic name, quiz title, question and choices, and student identifiers are excluded
by construction — but your question content does. Fine for a development project,
worth knowing deliberately.

---

## 12. The short version

Once you have done all of the above once, this is the whole thing:

```bash
# one-time
git clone <url> evalio && cd evalio
python -m venv .venv && source .venv/bin/activate     # Win: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp env_example .env
python scripts/devdb.py                                # db + migrate + seed
cd frontend && cp env_example .env.local && npm install && cd ..

# every day — three terminals
docker compose up -d --wait db
python manage.py runserver                             # :8000
cd frontend && npm run dev                             # :3000
```

Then open <http://localhost:3000>.

---

**Next:** [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together ·
[BACKEND.md](BACKEND.md) · [FRONTEND.md](FRONTEND.md)
