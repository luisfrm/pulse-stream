---
description: Write tests for the current changes
agent: test-writer
---

Write tests for the current changes in this session.

Follow the repo conventions: pytest integration tests in `apps/api/tests/` (requires `TEST_DATABASE_URL`; use the helpers in `apps/api/tests/helpers.py`) and Vitest + RTL unit tests in `apps/web/`. Cover behavior, not implementation.

Focus: $ARGUMENTS
