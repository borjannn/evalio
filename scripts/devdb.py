#!/usr/bin/env python
"""Bring the local database up and fill it with the demo dataset.

    python scripts/devdb.py            # start db, migrate, seed (idempotent)
    python scripts/devdb.py --fresh    # destroy the volume first, then the above

Why this exists rather than a file in `/docker-entrypoint-initdb.d/`:

Postgres runs those scripts once, on first initialisation of an empty data
directory, as raw SQL against a database that has no tables. Evalio's schema is
owned by Django migrations, and the demo data is built by `seed_demo` through
the ORM so that model `save()` hooks run — `AnswerResponse.save()` writing its
snapshot fields is the whole reason the demo attempts survive a question edit.
Neither can happen before `manage.py migrate`, which runs from the host, after
the container is accepting connections. So "initialise the database" is
necessarily a host-side sequence, not a container entrypoint hook.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def run(command: list[str], *, step: str) -> None:
    # No ANSI bold here: Windows PowerShell 5.1 prints the escape sequence
    # literally when output is redirected, which is worse than plain text.
    print(f"\n$ {' '.join(command)}")
    result = subprocess.run(command, cwd=REPO_ROOT)
    if result.returncode != 0:
        sys.exit(f"\n{step} failed (exit {result.returncode}). Stopping.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Destroy the Postgres volume first. Everything in the database is lost.",
    )
    args = parser.parse_args()

    if not (REPO_ROOT / ".env").exists():
        sys.exit(
            "No .env at the repo root. Settings read POSTGRES_* with no fallbacks, so\n"
            "Django cannot start without it. Copy it first:  cp env_example .env"
        )

    if args.fresh:
        # -v drops the named volume, which is the only way to get a genuinely
        # empty database — `down` alone leaves the data directory intact.
        run(["docker", "compose", "down", "-v"], step="Removing the old volume")

    # --wait blocks on the healthcheck in docker-compose.yml, so migrate cannot
    # race a container that is running but not yet accepting connections.
    run(["docker", "compose", "up", "-d", "--wait", "db"], step="Starting Postgres")

    run([sys.executable, "manage.py", "migrate"], step="Applying migrations")

    # seed_demo is idempotent via --flush: it deletes only the demo accounts and
    # what cascades from them, so unrelated rows already in the database survive.
    seed = [sys.executable, "manage.py", "seed_demo"]
    if not args.fresh:
        seed.append("--flush")
    run(seed, step="Seeding demo data")

    print("\nDatabase ready. Start the servers with:")
    print("  python manage.py runserver")
    print("  cd frontend && npm run dev")


if __name__ == "__main__":
    main()
