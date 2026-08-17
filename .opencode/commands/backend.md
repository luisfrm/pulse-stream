---
description: Implement a backend change following the feature-layer conventions
agent: backend-expert
---

Implement the following backend change following the layer conventions in `AGENTS.md` (router → service → repository → models → schemas; enums only in Pydantic; never expose SQLAlchemy models in responses):

$ARGUMENTS

Verify with `uv run pytest` (when `TEST_DATABASE_URL` is set) and `uv run alembic upgrade head` if migrations are involved.
