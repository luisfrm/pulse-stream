---
description: Investigate and fix failing typecheck, lint or tests
agent: debugger
---

Investigate and fix the current failures in this repository:

1. Run `pnpm typecheck` and `pnpm lint` (plus `pnpm test` and/or `uv run pytest` when a test database is available).
2. Follow your process: reproduce → isolate → root cause → minimal fix → verify.
3. Report: root cause → change → verification.

Additional context: $ARGUMENTS
