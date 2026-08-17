---
description: Create a new hand-written Alembic migration in the repo style
---

Create a new Alembic migration by hand following the repo style:

1. Check the latest revision in `apps/api/alembic/versions/` (sequential strings like `"0005"`) and use it as `down_revision`.
2. Create the migration file `<next>_<short_description>.py` with `revision` and `down_revision` strings and `upgrade()`/`downgrade()` using `op.create_table`/`op.drop_table`, `op.add_column`/`op.drop_column`, etc.
3. If the migration adds a table/model, import the model in `apps/api/tests/conftest.py` (tests register `Base.metadata` manually).
4. Run `uv run alembic upgrade head` to verify it applies cleanly; if it touches an existing table, also verify `uv run alembic downgrade <previous>` and `uv run alembic upgrade head` again to confirm it is reversible.

Context for the migration: $ARGUMENTS
