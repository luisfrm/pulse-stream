---
description: Regenerate API types from the OpenAPI schema
---

Regenerate the TypeScript API types from the backend OpenAPI schema:

1. Make sure the API is running and responding on http://localhost:8000/openapi.json.
2. Run `pnpm gen:types` (regenerates `packages/api-types/src/generated.ts`).
3. Run `pnpm typecheck` to confirm the frontend is in sync and nothing broke.
