---
name: run-dev
description: Bring up the full Evalio local stack — Postgres via docker compose, .env check, migrations, seed data, Django dev server, and the Next.js frontend. Use when the user wants to run the app, start the servers, or check that a change works in the browser.
disable-model-invocation: true
---

# Run the Evalio dev stack

Work through these in order. Stop and report if a step fails — don't work around a failure silently.

## 1. Environment files

Two are needed:

- `.env` at the repo root — Django reads `POSTGRES_DB/USER/PASSWORD/HOST/PORT` with no fallbacks, so
  a missing file produces a confusing connection error rather than a clear one. Copy `env_example`;
  its values match `docker-compose.yml`.
- `frontend/.env.local` — copy `frontend/env_example`. `lib/api.ts` throws at import time without
  `DJANGO_API_URL`, so every frontend route 500s.

## 2. Database, migrations and seed data

```
python scripts/devdb.py
```

One command: `docker compose up -d --wait db`, then `migrate`, then `seed_demo --flush`. The
`--wait` blocks on the compose healthcheck, so migrate cannot race a container that is running but
not yet accepting connections.

`--fresh` drops the volume first. Offer it when the database is in an unknown state; warn that
everything in it is lost.

If Docker itself isn't running, the first command fails with a named-pipe error — start Docker
Desktop and wait for the engine before retrying.

If there are model changes that haven't been captured, run `python manage.py makemigrations` first
and show the user the generated migration before applying it.

## 4. Backend

Start the Django dev server on port 8000 in the background:

```
python manage.py runserver
```

## 5. Frontend

From `frontend/`, install dependencies if `node_modules` is missing, then:

```
npm run dev
```

Next serves on port 3000. The browser only ever talks to :3000 — all Django calls go server-to-server
through the BFF — so **CORS does not apply** and a different port is not a CORS problem.

If the dev server was started before `frontend/.env.local` existed, restart it. Next reads env files
at startup, so `DJANGO_API_URL` will otherwise be undefined and every route will 500.

## 6. Report

Tell the user both URLs and whether each server came up cleanly.

For accounts, point them at the `seed_demo` output — every account uses password `evalio123`.
`mpetrova` is a teacher, `aivanov` a student with a perfect score, `bmarkov` a mixed result with a
real feedback passage.

If they need a *new* teacher, note that **registration always creates a student** — `role` in the
request body is ignored, and the sign-up screen has no role control by design. A teacher account has
to be made out of band:

```
python manage.py createsuperuser
```

then set `role` to `teacher` at `/admin/`. Without one, every teacher endpoint returns 403.
