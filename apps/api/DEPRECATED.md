# ⚠️ DEPRECATED — `apps/api` (FastAPI) está congelado

> **No usés este backend para nada nuevo.** Desde el 2026-11-21 la API de
> Python está **deprecada y congelada**: no se le agregan endpoints, fixes ni
> migraciones nuevas.

## Qué usar en su lugar

Toda la implementación de backend vive en **`apps/api-worker`** (Hono +
Drizzle sobre Cloudflare Workers / Neon HTTP). Ese es el único backend en
runtime y el único que recibe trabajo nuevo.

- Endpoints nuevos → **solo en el Worker**. Si la ruta no existe en este
  backend, se documenta como desviación deliberada con
  `WORKER_ONLY_PATHS` (`apps/api-worker/src/lib/contract.ts`).
- Migraciones nuevas → **solo Drizzle** (`apps/api-worker/migrations`).
- Tipos del frontend → `pnpm export:openapi` + `pnpm gen:types:worker`
  (ambos ya no dependen de este backend).

## Por qué sigue en el repo (y qué significa "congelado")

- Es la **referencia histórica del contrato OpenAPI**: el fixture
  `apps/api-worker/src/lib/__fixtures__/openapi-contract.json` se generó desde
  su OpenAPI y el gate de paridad del Worker lo sigue usando para detectar
  regresiones de forma. Ese fixture **no se regenera**.
- Sus tests (`pytest`) siguen corriendo en CI contra el esquema que comparte
  con el Worker, pero no reciben cobertura nueva: cada endpoint
  worker-only (`WORKER_ONLY_PATHS`) se teste únicamente en el Worker.

## Reglas para agentes

| Si te piden… | Hacé… |
|---|---|
| Un endpoint/cambio de backend | `apps/api-worker` (routes → services → repositories, con tests vitest). Nunca `apps/api`. |
| Una migración | Drizzle a mano en `apps/api-worker/migrations` + `db:migrate`. Nunca Alembic. |
| Regenerar tipos | `pnpm --filter @pulse-stream/api-worker export:openapi` + `pnpm gen:types:worker`. Nunca `pnpm gen:types` (apunta acá). |
| Cambiar un schema compartido | Solo en el Worker; el gate de contrato te avisa si la forma diverge del fixture. |

El bootstrap del esquema de la base de test sigue usando las migraciones
Alembic existentes (es lo que hace CI: Alembic base + deltas Drizzle), pero
eso es infraestructura de test, no trabajo de feature.
