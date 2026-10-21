# Migración a Hono + Workers (app) con panel Python local

Plan de ejecución por fases para dividir Pulse Stream en:

- **app** (`apps/web`): Next.js en Vercel, consume una API Hono en Cloudflare Workers.
- **panel** (`apps/panel`): Next.js local, consume la API Python actual (`apps/api`) en `localhost:8000`.
- **app-api** (`apps/app-api`): Hono en Workers, lee/escribe la misma DB Neon y firma uploads a R2.
- **api** (`apps/api`): FastAPI, solo panel/administración, corre local.

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Plan Workers | Free primero; Paid ($5) cuando se necesite password auth o más límites |
| Auth app | Google OAuth-only (`openid email profile`), sesión JWT HS256 en cookie `session` |
| Auth panel | Email/password local (fastapi-users), admin separado por seed, cookie `panel_session` |
| Frontend | Dos apps Next separadas, paquetes compartidos en `packages/*` |
| API app | Hono + Zod OpenAPI + Drizzle + `pg` sobre Hyperdrive |
| API panel | Python actual, sin cambios de contrato salvo los de la migración 0010 |
| DB | Neon `main` (prod) + branches `dev`/`test`; Alembic sigue siendo el dueño del esquema |
| Dominio | Cloudflare: `app.luisrivas.site` → Vercel, `api.luisrivas.site` → Worker Custom Domain |
| Cache | Lecturas públicas 60 s en el Worker; datos por usuario nunca se cachean |

## Arquitectura

```
app.luisrivas.site   Next/Vercel ── cookie session (Domain=.luisrivas.site) ──┐
api.luisrivas.site   Hono/Workers ── Hyperdrive ── Neon main                  │
                            └── R2 (presign de covers; audio/covers directo)  │
panel localhost:3001 Next/panel ── panel_session ── localhost:8000 Python ────┘
                                                     └── Neon main + R2 (ZIP)
```

## Fases

| Fase | Doc | Estado |
|---|---|---|
| 0. Fundación: migración 0010, admin seed, esqueleto Hono + Google OAuth | [phase-0-foundation.md](phase-0-foundation.md) | En curso |
| 1. Split del frontend en `apps/web` + `apps/panel` + packages | [phase-1-frontend-split.md](phase-1-frontend-split.md) | Pendiente |
| 2. Lecturas de la app en Hono con paridad y caché | [phase-2-reads.md](phase-2-reads.md) | Pendiente |
| 3. Escrituras de usuario en Hono | [phase-3-writes.md](phase-3-writes.md) | Pendiente |
| 4. Cutover, deploy y documentación | [phase-4-cutover.md](phase-4-cutover.md) | Pendiente |
| 5. Upgrade a Workers Paid (opcional) | [phase-5-paid.md](phase-5-paid.md) | Pendiente |

Estado detallado: [STATUS.md](STATUS.md).

## Invariantes

1. **La app nunca llama a Python; el panel nunca llama a Hono.** Cada frontend tiene su cliente API y su cookie.
2. **Una sola DB, un solo dueño de esquema.** Alembic manda; el schema de Drizzle se genera con `drizzle-kit pull` y CI falla si difiere.
3. **La app no es read-only.** Además de lecturas, Hono es dueño de favoritos, playlists de usuario, listens/contadores, perfil (username/cover) y presign de covers.
4. **El panel es dueño del catálogo**: artists/albums/songs, ZIP, playlists system, uploads de audio, admin de usuarios.
5. **Contratos idénticos**: `{detail}` para errores, `Page<T> = {items,total,offset,limit}`, mismos status codes y shapes que Python en todo endpoint compartido. Los tests de paridad son obligatorios.
6. **Presupuesto Free**: ≤3 queries por request, sin N+1, respuestas ≤50 KB, lecturas públicas cacheadas, sin hashing de passwords hasta Paid, sin `@aws-sdk` (usar `aws4fetch`).
7. **Cookies**: `session` (app, `Domain=.luisrivas.site` en prod) y `panel_session` (panel local). `workers.dev` no se usa para la API: es public suffix.
8. **SQLAlchemy `onupdate` no existe en la DB.** Todo UPDATE de Hono setea `updated_at = now()` explícitamente.

## Cómo correr

```bash
# API panel (Python)
cd apps/api && uv run uvicorn app.main:app --reload   # :8000

# App (Vercel local)
pnpm --filter @pulse-stream/web dev                   # :3000

# Panel (local)
pnpm --filter @pulse-stream/panel dev                 # :3001

# API app (Workers local)
pnpm --filter @pulse-stream/app-api dev               # :8787 (wrangler dev)

# Tests
cd apps/api && uv run pytest          # integración contra TEST_DATABASE_URL
pnpm test                             # turbo: web + panel + app-api
```

## Estrategia de commits

Un commit por fase, con tests verdes antes de commitear:

```
docs(hono): add phased migration plan
feat(hono): phase 0 - schema, admin seed and Workers auth skeleton
refactor(web): phase 1 - split app and panel with shared packages
feat(app-api): phase 2 - app read endpoints with parity tests
feat(app-api): phase 3 - user writes, listens and cover presign
chore(deploy): phase 4 - cutover, docs and infrastructure notes
feat(app-api): phase 5 - optional password auth (Workers Paid)
```
