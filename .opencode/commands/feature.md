---
description: Scaffold a new backend feature (router, service, repository, models, schemas, tests)
---

Scaffold a new backend feature named `$ARGUMENTS` following the repo conventions in `AGENTS.md`:

1. Create `apps/api/app/features/<name>/` with `router.py`, `service.py`, `repository.py`, `models.py` and `schemas.py`, following the layer rules: router only HTTP, service business logic, repository only SQLAlchemy queries, models with plain `VARCHAR`/`JSON`/`TEXT` columns (no `sa.Enum`), schemas Pydantic with `ConfigDict(from_attributes=True)`.
2. Match the structure of an existing simple feature (e.g. `favorites` or `listens`).
3. Wire the router into `apps/api/app/main.py` (import + `app.include_router(...)`).
4. If a new table is needed: write the Alembic migration by hand in the repo style (`apps/api/alembic/versions/`, sequential revision like `"0006"` with `down_revision` chained) and import the new model in `apps/api/tests/conftest.py`.
5. Add integration tests in `apps/api/tests/` following the existing pattern (create via API → assert status + JSON shape).
6. Report what was created and how to verify (`uv run pytest`, `pnpm gen:types` if schemas changed).
