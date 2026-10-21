# Estado de la migración

Actualizado: 2026-10-21

## Fase 0 — Fundación

- [x] Migración 0010 (`hashed_password` nullable + `oauth_accounts`) — aplicada en dev; test con upgrade/downgrade
- [x] Modelo `OAuthAccount` + `UserManager.authenticate` guard
- [x] `SESSION_COOKIE_NAME` configurable
- [x] `upsert_admin` + `scripts/create_admin.py`
- [x] Tests Python (nullable, login 400, constraints, admin seed) — 6 tests
- [x] `apps/app-api` skeleton (Hono, config, env, errores)
- [x] JWT/cookies + Google OAuth (state + PKCE + ID token)
- [x] `GET /users/me`, `/auth/logout`, `/health`
- [x] Tests Hono + typecheck — 6 archivos / 42 tests
- [x] Suite Python completa verde — 118 passed
- [x] Commit de fase

Pendiente externo (no bloquea local): Hyperdrive ID real, Google OAuth
client/secrets y deploy del Worker.

## Fase 1 — Split del frontend

- [x] `packages/ui`, `design`, `api-client`, `shared`
- [x] `apps/panel` (rutas, shell, servicios, login)
- [x] `apps/web` sin panel, sin link al panel
- [x] Tailwind v4 compartido + `transpilePackages`
- [x] Tests movidos/verdes
- [x] `pnpm typecheck && lint && test && build`
- [x] Playwright smoke (app + panel) — panel login → /panel/artists|songs|playlists; app login → /dashboard|/catalog|/songs|/playlists; `/panel` en web = 404; sin errores de consola salvo el 404 intencional
- [x] Commit de fase

## Fase 2 — Lecturas

- [x] Endpoints de lectura en Hono con contrato espejo de Python: `/songs`,
      `/songs/popular`, `/songs/{id}`, `/albums`, `/albums/{id}`, `/artists`,
      `/artists/{id}`, `/genres`, `/playlists/public`, `/playlists`,
      `/playlists/{id}`, `/me/favorites[/ids|/albums|/albums/ids|/playlists|/playlists/ids]`,
      `/me/library/ids`, `/me/playlists`, `/me/playlists/page`,
      `/me/recently-played`
- [x] `CatalogRepository` (`pg` parametrizado) + mappers puros + schemas Zod
      OpenAPI + DI `catalog` en `createApp` (tests con fake)
- [x] Un único `pg.Client` por request compartido entre `users` y `catalog`
- [x] Tests: 123 en `apps/app-api` (rutas con repo fake, mappers, SQL emitido,
      caché y los 42 de Fase 0)
- [x] Caché pública 60 s (`hono/cache`) en GETs públicos; `/me/*`,
      `/users/me` y `/playlists/{id}` sin caché (no-op si no hay `caches`)
- [x] Smoke de integración del repository contra la DB de desarrollo (script
      `tsx` temporal, borrado): `/songs` (51), `/albums/{id}` (13 canciones,
      nested `song_count` 13), playlist parity (2 canciones en posición),
      favoritos + biblioteca, `/me/playlists` con `song_ids` y
      `/me/recently-played` (2 canciones, `user_play_count` 1)
- [x] Driver de DB local: Neon HTTP (`@neondatabase/serverless`) cuando
      `ENV=local`; en producción `pg` + Hyperdrive. `pg` sobre TCP no completa
      la conexión en Miniflare.
- [x] Desempate de orden estable para canciones con el mismo `created_at`
      (import ZIP): Python y Hono ordenan `created_at DESC, title ASC, id ASC`;
      el detalle de álbum por `title ASC, id ASC`.
- [x] Paridad en vivo Python `:8000` vs Hono `:8787` contra la misma DB:
      **25/25 endpoints OK** (JSON normalizado, incluye `/me/*`, nested
      `song_count`, fechas y URLs de R2). Ver
      `docs/hono_migration/phase-2-reads.md`.
- [ ] Fixtures dorados reproducibles en CI (seed fijo) — la paridad en vivo ya
      se corrió; falta empaquetarla para CI.
- [ ] p99 de CPU < 8 ms medido en Workers
- [ ] `packages/app-api-types` desde `/openapi.json`
- [x] Commit de fase

## Fase 3 — Escrituras

- [ ] Favoritos
- [ ] Playlists de usuario
- [ ] Listens + contadores (CTE)
- [ ] Perfil + presign cover
- [ ] Tests de estado/DB
- [ ] Commit de fase

## Fase 4 — Cutover

- [ ] Migración en prod
- [ ] Deploy Worker + Vercel
- [ ] Google OAuth en prod
- [ ] Panel local con `panel_session`
- [ ] Playwright prod
- [ ] Docs (`AGENTS.md`, `README.md`, `tasks.md`, plan)
- [ ] Commit de fase

## Fase 5 — Paid

- [ ] Upgrade
- [ ] Password auth (opcional)
- [ ] Monitoreo
