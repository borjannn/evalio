---
name: run-dev
description: Bring up the full Evalio local stack — Postgres via docker compose, .env check, migrations, Django dev server, and the Vite frontend. Use when the user wants to run the app, start the servers, or check that a change works in the browser.
disable-model-invocation: true
---

# Run the Evalio dev stack

Work through these in order. Stop and report if a step fails — don't work around a failure silently.

## 1. Environment file

Check that `.env` exists at the repo root. If it doesn't, copy `env_example` to `.env`. Django's
settings read `POSTGRES_DB/USER/PASSWORD/HOST/PORT` with no fallback values, so a missing `.env`
produces a confusing connection error rather than a clear one.

The values in `env_example` match the credentials in `docker-compose.yml`, so the copy works as-is
for local development.

## 2. Database

```
docker compose up -d db
```

This starts Postgres 16 as container `evalio_db` on port 5432 with a named volume, so data survives
restarts. If the port is already bound, check whether a local Postgres install is competing for it
before changing the compose file.

Give it a moment to accept connections, then confirm with `docker compose ps`.

## 3. Migrations

```
python manage.py migrate
```

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

Next serves on port 3000, the only entry in `CORS_ALLOWED_ORIGINS`. If 3000 is taken Next picks
another port and direct browser calls to Django will fail CORS — free the port rather than adding
the new origin. (Once the BFF proxy lands, the browser only talks to same-origin route handlers and
CORS stops applying at all.)

## 6. Report

Tell the user both URLs and whether each server came up cleanly.

If they need an account, note that **registration always creates a student** — `role` in the request
body is ignored. A teacher account has to be made out of band:

```
python manage.py createsuperuser
```

then set `role` to `teacher` at `/admin/`. Without one, every teacher endpoint returns 403.
