# Estado de la migración

Actualizado: 2026-10-21

## Fase 0 — Fundación

- [x] Migración 0010 (`hashed_password` nullable + `oauth_accounts`) — aplicada en dev
- [x] `SESSION_COOKIE_NAME` configurable
- [x] `upsert_admin` + `scripts/create_admin.py`
- [x] Tests Python de admin seed/session
- [x] `apps/app-api` skeleton (Hono, config, env, errores)
- [x] JWT/cookies + `GET /users/me`, `/auth/logout`, `/health`
- [x] Commit de fase
- [x] **OAuth eliminado después**: se quitaron `/auth/google`, `oauth_state`,
      `resolveGoogleUser`, el modelo `OAuthAccount` y el link del web.
      Migración `0011` dropea `oauth_accounts`.

## Fase 1 — Split del frontend

- [x] `packages/ui`, `design`, `api-client`, `shared`
- [x] `apps/panel` (rutas, shell, servicios, login)
- [x] `apps/web` sin panel, sin link al panel
- [x] Tailwind v4 compartido + `transpilePackages`
- [x] Tests movidos/verdes
- [x] `pnpm typecheck && lint && test && build`
- [x] Playwright smoke (app + panel)
- [x] Commit de fase

## Fase 2 — Lecturas

- [x] Endpoints de lectura en Hono con contrato espejo de Python.
- [x] `CatalogRepository` (SQL parametrizado) + mappers puros + schemas Zod
      OpenAPI + DI `catalog` en `createApp` (tests con fake).
- [x] **Un solo driver de DB**: Neon HTTP (`@neondatabase/serverless`) en local y
      producción. Sin `pg`, Hyperdrive ni `localConnectionString`.
- [x] Caché pública 60 s (`hono/cache`) en GETs públicos; `/me/*`,
      `/users/me` y `/playlists/{id}` sin caché.
- [x] Paridad en vivo Python `:8000` vs Hono `:8787` contra la misma DB:
      **25/25 endpoints OK**.
- [ ] Fixtures dorados reproducibles en CI (seed fijo).
- [ ] p99 de CPU < 8 ms medido en Workers.
- [x] `packages/app-api-types` desde `apps/app-api/openapi.json`.
- [x] Commit de fase.

## Fase 3 — Escrituras

- [x] Favoritos: PUT/DELETE songs/albums/playlists, idempotente, 404/403 como Python.
- [x] Playlists de usuario: crear/editar/borrar, add (max+1)/remove (renumera
      0..n-1), dueño vs ajeno, system solo admin, `updated_at=now()`.
- [x] Listens: dedupe 30 s + `songs.play_count`/`users.total_plays` en una sola
      sentencia con CTEs (driver Neon HTTP, sin transacción interactiva).
- [x] Perfil: `PATCH /users/me` solo username/cover_key; role/email/password
      ignorados; username único case-insensitive; `cover_url` resuelta.
- [x] Presign cover: WebP ≤256 KB, key `covers/{uuid}.webp`, `aws4fetch` con
      `Cache-Control` inmutable firmado.
- [x] Tests de rutas + SQL emitido; smoke real contra la DB de desarrollo.
- [x] Commit de fase.
- [ ] Rate limit Upstash en `/auth/*` y `/me/listens` (diferido).

## Fase 4 — Cutover

**Código (completo, sin deploy):**

- [x] `packages/app-api-types` generado desde `apps/app-api/openapi.json`;
      `pnpm gen:types:app`; `apps/web` lo usa.
- [x] `apps/web` contra Hono: `NEXT_PUBLIC_API_URL=http://localhost:8787` local /
      `https://api.luisrivas.site` prod, cookie `session`, fallback :8787.
- [x] **Solo password**: `/login` muestra el formulario email/usuario +
      contraseña; `/register` redirige a `/login`; las cuentas se crean con el
      seed del panel. Sin Google OAuth.
- [x] `POST /auth/login` en Hono: `identifier` email o username
      (case-insensitive), argon2id de pwdlib verificado con `@noble/hashes` →
      cookie `session`. **Requiere Workers Paid en prod**.
- [x] Fix loop de sesión inválida en `proxy.ts`.
- [x] `/account`: email read-only, sin contraseña; `updateMe` solo
      `username`/`cover_key` + presign de Hono.
- [x] Panel con `panel_session`; Python local con
      `SESSION_COOKIE_NAME=panel_session`.
- [x] **DB única**: `db/client.ts` usa Neon HTTP en local y prod; se eliminaron
      `pg`, Hyperdrive y el binding `HYPERDRIVE`.
- [x] **CD en master**: `.github/workflows/ci.yml` corre tests, migra Neon y
      ejecuta `wrangler deploy --env prod` + sync de secrets, solo en push a
      `master` y tras los tests.
- [x] Verificación: `pnpm --filter @pulse-stream/app-api typecheck` + test
      (134), web typecheck/test (36), build web; Wrangler dry-run.
- [x] Playwright local de password, dashboard, catálogo, like, logout y panel.
- [x] Commit de fase.

**Bloqueado por credenciales/infra (no ejecutado):**

- [ ] Migración `0011` (drop `oauth_accounts`) en Neon `main`.
- [ ] Secrets del Worker: `DATABASE_URL`, `AUTH_SECRET`, R2.
- [ ] Deploy: Worker `api.luisrivas.site` + `pulse-stream.luisrivas.site` en Vercel.
- [ ] Seed del admin en la DB de prod.
- [ ] Playwright/smoke contra producción.
- [ ] Rate limit en `/auth/*`.

## Fase 5 — Paid

- [x] Password auth implementado (`POST /auth/login`, argon2 noble).
- [ ] Upgrade a Workers Paid (necesario para password auth en prod; Free 10 ms).
- [ ] Monitoreo de CPU/errores 1102 y Playwright contra prod.
- [ ] Rate limit en `/auth/*` y `/me/listens`.
