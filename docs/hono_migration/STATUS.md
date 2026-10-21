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
- [x] `packages/app-api-types` desde `apps/app-api/openapi.json` (Fase 4)
- [x] Commit de fase

## Fase 3 — Escrituras

- [x] Favoritos: PUT/DELETE songs/albums/playlists, idempotente, 404/403 como Python
- [x] Playlists de usuario: crear/editar/borrar, add (max+1)/remove (renumera
      0..n-1), dueño vs ajeno, system solo admin, `updated_at=now()`
- [x] Listens: dedupe 30 s + `songs.play_count`/`users.total_plays` en una sola
      sentencia con CTEs (driver Neon HTTP, sin transacción interactiva)
- [x] Perfil: `PATCH /users/me` solo username/cover_key; role/email/password
      ignorados; username único case-insensitive; `cover_url` resuelta
- [x] Presign cover: WebP ≤256 KB, key `covers/{uuid}.webp`, `aws4fetch` con
      `Cache-Control` inmutable firmado (`allHeaders`)
- [x] Tests: **149 passed** (13 archivos; rutas con fake writes + SQL emitido)
- [x] Smoke real contra la DB de desarrollo: favoritos idempotentes, playlist
      add/remove/renumber (posición 1→0), listen dedupe (1 fila, +1 contador),
      perfil y URL de R2 con `X-Amz-SignedHeaders` incluyendo
      `content-type`/`cache-control`. Datos de prueba limpiados (play_count
      restaurado)
- [x] Commit de fase
- [ ] Rate limit Upstash en `/auth/*` y `/me/listens` (diferido a Fase 4/5)

## Fase 4 — Cutover

**Código (completo, sin deploy):**

- [x] `packages/app-api-types` generado con `openapi-typescript` desde
      `apps/app-api/openapi.json`; `pnpm gen:types:app`; `apps/web` lo usa (el
      panel conserva `@pulse-stream/api-types`). Los schemas de Hono espejan los
      nombres de Python.
- [x] `apps/web` contra Hono: `NEXT_PUBLIC_API_URL=http://localhost:8787` local /
      `https://api.luisrivas.site` prod, cookie `session`, fallback :8787.
- [x] `auth-service`: `googleAuthUrl(returnTo)` + `login({identifier,password})`;
      se mantiene el logout same-origin. La app es Google + password (no
      register con password).
- [x] `/login` con "Continuar con Google" **y** formulario email/usuario +
      contraseña (sin "Recordarme", conserva `next`); `/register` redirige a
      `/login`. El alta nueva es Google; el password es para cuentas existentes.
- [x] `POST /auth/login` en Hono: `identifier` email o username
      (case-insensitive), argon2id de pwdlib verificado con `@noble/hashes` (JS
      puro; `hash-wasm` no compila WASM en Workers) → cookie `session`.
      **Requiere Workers Paid en prod** (argon2 ~2 s CPU; Free 10 ms).
- [x] Fix loop de sesión inválida: el proxy ya no redirige `/login` →
      `/dashboard` solo por presencia de cookie; una cookie vencida va a
      `/login` y queda ahí (sin parpadeo infinito).
- [x] `/account`: email read-only, sin contraseña; `updateMe` solo
      `username`/`cover_key` (`null` borra el cover) + presign de Hono.
- [x] Panel con `panel_session`: default en client/proxy/logout, `.env.local`,
      `.env.example`; Python local con `SESSION_COOKIE_NAME=panel_session`
      (`.env.example` + `.env` local). El panel sigue 100% contra Python.
- [x] Home chequea `SESSION_COOKIE` configurada (no el literal `session`).
- [x] Docs: `AGENTS.md`, `apps/{web,panel}/AGENTS.md`, `README.md`, `tasks.md`,
      `plan-implementacion.md`, `docs/hono_migration/README.md`,
      `apps/app-api/README.md`.
- [x] Verificación: `pnpm typecheck` (8/8), `pnpm lint` (0 errores; 2 warnings
      preexistentes en `recently-played/page.tsx`), `pnpm test` (app-api 156,
      web 37, panel 15, api-client 6, shared 11), `pnpm build` (web + panel OK).
- [x] Playwright local: login con **email + password** y con **username +
      password** (admin), Google link/redirect 302 con state/PKCE, dashboard/
      catálogo/canciones/account, like contra Hono, logout de la app, panel
      sigue logueado con `panel_session`, y `session=invalid` ya no genera loop
      (`/login` estable).

**Bloqueado por credenciales/infra (no ejecutado):**

- [ ] Crear el Google OAuth Client (redirect URIs
      `https://api.luisrivas.site/auth/google/callback` y
      `http://localhost:8787/auth/google/callback`) y cargar
      `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`.
- [ ] Hyperdrive ID real (reemplazar `REPLACE_WITH_HYPERDRIVE_ID`) + secrets del
      Worker (`AUTH_SECRET`, R2, vars de prod).
- [ ] Migración `0010` en Neon `main` (aprobación explícita).
- [ ] Deploy: Worker `api.luisrivas.site` + `apps/web` en Vercel.
- [ ] Playwright/smoke contra producción (login Google real y password en Paid).
- [x] Commit de fase

## Fase 5 — Paid

- [x] Password auth implementado en código (`POST /auth/login`, argon2 noble)
- [ ] Upgrade a Workers Paid (necesario para password auth en prod; Free 10 ms)
- [ ] Monitoreo de CPU/errores 1102 y Playwright contra prod
- [ ] Rate limit Upstash en `/auth/*` y `/me/listens` (pendiente de Fase 3)
