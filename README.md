# Pulse Stream 🎧

Spotify clone en monorepo. Stack: **pnpm workspaces · turbo · Next.js 16 · Hono en Cloudflare Workers · FastAPI (solo panel local) · SQLAlchemy 2.0 async · Neon (Postgres serverless) · Cloudflare R2 · Tailwind v4 · PWA · login con email/usuario + contraseña**.

> 📋 El plan completo de implementación está en [`plan-implementacion.md`](./plan-implementacion.md) y las reglas de arquitectura del backend en [`AGENTS.md`](./AGENTS.md). Leelos antes de tocar código.

## Estructura

```
pulse-stream/
├── apps/
│   ├── app-api/                  # Hono + Cloudflare Workers (API de la app, :8787)
│   ├── web/                      # Next.js 16 (app de música, :3000)
│   ├── panel/                    # Next.js 16 (backoffice admin local, :3001)
│   └── api/                      # FastAPI + uv (panel/admin, dueño del esquema, :8000)
├── packages/
│   ├── app-api-types/            # Tipos TS generados desde el OpenAPI de Hono (web)
│   ├── api-types/                # Tipos TS generados desde el OpenAPI de Python (panel)
│   ├── api-client/ · design/ · shared/ · ui/ · config/
├── pnpm-workspace.yaml
├── package.json                  # scripts turbo
└── turbo.json
```

## Requisitos

- Node ≥ 20 (se usa 24) y pnpm ≥ 9 (se usa 11.5.3)
- [uv](https://docs.astral.sh/uv/) ≥ 0.6 y Python ≥ 3.13
- Una base **Postgres** (recomendado: [Neon](https://neon.tech), plan free) — no hay SQLite ni Docker en el flujo de desarrollo

## Setup

### 1. API de la app — Hono (`apps/app-api`, :8787)

```bash
cd apps/app-api
cp .dev.vars.example .dev.vars   # AUTH_SECRET + DATABASE_URL
cd ../..
pnpm install
pnpm --filter @pulse-stream/app-api dev   # wrangler dev → http://localhost:8787
```

- Local y producción usan el mismo driver HTTP de Neon
  (`@neondatabase/serverless`) con `DATABASE_URL`; no hay Hyperdrive ni `pg`.
- **No hay OAuth ni registro público**: las cuentas se crean con el seed del
  panel. El login es email/usuario + contraseña.
- El contrato OpenAPI está versionado en `apps/app-api/openapi.json`.

### 2. API del panel — FastAPI (`apps/api`, :8000)

```bash
cd apps/api
cp .env.example .env   # completá DATABASE_URL/R2; SESSION_COOKIE_NAME=panel_session
uv sync --all-groups
uv run alembic upgrade head   # crea las tablas (usa la conexión directa)
# o desde la raíz del monorepo: pnpm db:migrate (mismo .env de apps/api)
uv run uvicorn app.main:app --reload   # http://localhost:8000
```

Swagger (solo en `ENV=local`): http://localhost:8000/docs

> Desde la Fase 4 esta API es **solo del panel local**: la app habla con Hono.
> El nombre de cookie debe ser `panel_session`
> (`SESSION_COOKIE_NAME=panel_session`) para no chocar con la `session` de Hono
> en localhost.

### 3. App (`apps/web`, :3000)

```bash
cd apps/web
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8787
pnpm dev                     # http://localhost:3000
```

Login: **email/usuario + contraseña** en `/login`. No hay OAuth ni registro
público: `/register` redirige a `/login` y las cuentas se crean con el seed del
panel (`apps/api/scripts/create_admin.py`). `/account` solo edita username +
foto (el email es read-only). En producción el login con password requiere
Workers Paid (argon2 supera el CPU de Free).

### 4. Panel (`apps/panel`, :3001)

```bash
cd apps/panel
cp .env.example .env.local   # API Python :8000 + PANEL_SESSION_COOKIE=panel_session
pnpm dev                     # http://localhost:3001
```

### 5. Tipos TS desde OpenAPI (regla de AGENTS.md)

Los tipos del frontend se **generan**, nunca se declaran a mano:

```bash
pnpm gen:types:app   # Hono → packages/app-api-types (lo usa apps/web)
pnpm gen:types       # Python → packages/api-types (lo usa apps/panel; API en :8000)
```

### Scripts raíz

```bash
pnpm dev         # turbo dev: app-api (:8787) + web (:3000) + panel (:3001)
pnpm build
pnpm lint
pnpm typecheck
pnpm test        # turbo test (web/panel/packages); API Python: cd apps/api && uv run pytest
pnpm db:migrate  # alembic upgrade head (apps/api/.env; por defecto DB de desarrollo)
pnpm db:current  # revisión Alembic aplicada
```

## Variables de entorno

### `apps/api/.env`

| Variable | Obligatoria | Descripción |
|---|---|---|
| `ENV` | no (default `local`) | `local` \| `dev` \| `prod`. Decide cookies Secure/SameSite, Swagger y logs |
| `AUTH_SECRET` | **sí** | Secreto para firmar los JWT de sesión. Generar con `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `DATABASE_URL` | **sí** | Conexión a Neon **pooled** (host con `-pooler`) con `postgresql+asyncpg://` |
| `DATABASE_URL_DIRECT` | no | Conexión **directa** de Neon (sin `-pooler`). La usa Alembic para migraciones; sin ella, Alembic usa `DATABASE_URL` |
| `CORS_ORIGIN_REGEX` | no | Regex de orígenes permitidos con cookies (default: subdominios de `tudominio.com` + `localhost:\d+`) |
| `RATE_LIMIT_LOGIN` / `RATE_LIMIT_REGISTER` / `RATE_LIMIT_PRESIGN` | no | Límites de slowapi (defaults `5/minute`, `3/hour`, `10/minute`) |
| `R2_ACCOUNT_ID` | Fase 1 | Account ID de Cloudflare (Dashboard > R2) — genera el endpoint `https://<id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | Fase 1 | Access Key del API Token de R2 (permiso "Object Read & Write") |
| `R2_SECRET_ACCESS_KEY` | Fase 1 | Secret del API Token de R2 |
| `R2_BUCKET_NAME` | Fase 1 | Nombre del bucket creado en R2 |
| `R2_MAX_UPLOAD_BYTES` | no | Tamaño máximo de subida (default 50 MB) |
| `SESSION_COOKIE_NAME` | no (default `session`) | Nombre de la cookie HttpOnly. **En local el panel usa `panel_session`** para no compartir sesión con la `session` de Hono |
| `TEST_DATABASE_URL` | solo tests | Base de tests (ej. branch efímera de Neon). Sin ella, `pytest` se salta |

### `apps/web/.env.local`

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | no (default `http://localhost:8787`) | URL base de la **API Hono** (`https://api.luisrivas.site` en prod) |
| `SESSION_COOKIE` | no (default `session`) | Cookie HttpOnly que emite Hono y reenvía el api-client |
| `ENV` / `COOKIE_DOMAIN` / `COOKIE_SAMESITE` | no | Espejo del backend para el borrado de cookie del logout (`ENV=prod` + `COOKIE_DOMAIN=luisrivas.site` en prod) |

### `apps/panel/.env.local`

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | no (default `http://localhost:8000`) | URL base de la **API Python** (panel) |
| `PANEL_SESSION_COOKIE` | no (default `panel_session`) | Debe coincidir con `SESSION_COOKIE_NAME` de Python |
| `NEXT_PUBLIC_APP_URL` | no (default `http://localhost:3000`) | Links de "Mi cuenta" / "ver playlist" hacia la app |
| `ENV` / `COOKIE_DOMAIN` / `COOKIE_SAMESITE` | no | Espejo de Python para el Set-Cookie del logout |

### `apps/app-api/.dev.vars` (local)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `AUTH_SECRET` | **sí** | HS256 de `session` (≥ 32 chars) |
| `DATABASE_URL` | **sí** | Neon directo (driver HTTP) en local y producción |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | para covers | Credenciales de firmado de R2 |
| `ENV` / `APP_URL` / `COOKIE_DOMAIN` / `CORS_ORIGINS` | en `wrangler.jsonc` | `local`/`prod`, `http://localhost:3000` o `https://pulse-stream.luisrivas.site`, etc. |

## Estado del proyecto

### Fase 0 — Fundaciones ✅

- [x] Monorepo pnpm + turbo + CI básico
- [x] API FastAPI: auth con `fastapi-users` (cookie HttpOnly + JWT, Argon2), rate limiting (slowapi), CORS por regex, capas por feature según `AGENTS.md`, Alembic async, tests de integración
- [x] Web: login/registro/dashboard protegido (`proxy.ts`), tipos generados desde OpenAPI, theme Tailwind del plan
- [x] Verificado contra Neon real: migraciones + 27 tests de integración verdes

### Fase 1 — Catálogo ✅

- [x] CRUD de artistas (lectura pública, mutaciones admin, nombre único, búsqueda)
- [x] CRUD de canciones (géneros validados en Pydantic, letra, `artist_name` inline que crea el artista en la misma operación, búsqueda, filtro por `artist_id`)
- [x] `GET /genres` (mismo set de valores que valida el backend)
- [x] `POST /uploads/presign` (presigned PUT URL a R2 con boto3, validación `audio/mpeg` + tamaño, rate limit)
- [x] Migraciones Alembic 0001/0002 aplicadas
- [x] Panel de administración en el web: `/panel/artists`, `/panel/songs`, `/panel/songs/new` (subida directa a R2)
- [x] `stream_url` en cada canción (dominio público de R2) para reproducir sin auth
- [x] Verificado end-to-end real: presign → PUT a R2 → canción → stream público 200
- [x] **CORS del bucket R2 habilitado** (preflight `OPTIONS` 204 con `Allow-Origin: http://localhost:3000` + `PUT`) — la subida desde el navegador funciona

### Fase 2 — Experiencia usuario ✅

- [x] **Roles**: `role` nullable (`null` = usuario normal, `"admin"` = panel). Migración 0003 normaliza los `'user'` legacy → `NULL`. Endpoint `PATCH /admin/users/{id}/role` (promover/revocar, sin auto-revocación)
- [x] **Dos áreas separadas**: `(protected)` → `/dashboard` (configuraciones del usuario normal, cualquier sesión) y `(panel)` → `/panel/*` (solo `role=admin`; sin sesión → `/login`, sin rol → `/`)
- [x] **Home público** (`/`): hero + búsqueda con estado en URL + catálogo de canciones con play + sidebar de artistas
- [x] **Páginas públicas**: `/artist/[id]` (canciones del artista, filtro `artist_id`) y `/song/[id]` (detalle + letra)
- [x] **Reproductor persistente** (`components/player/`): barra fija inferior, cola por lista, **Media Session API** (controles de pantalla de bloqueo/notificación)
- [x] **UI kit** (`components/ui/`): Button/Badge/Card/Input/Title con `cva` + `cn` + `Slot` (asChild) según la guía de `packages/ui`
- [x] Verificado end-to-end real: guards de `/panel` (sin cookie → login, usuario normal → home, admin → 200), subida real a R2 con CORS, páginas de artista/canción con datos reales

### Fase 3 — Módulos estilo Spotify ✅

- [x] **Playlists**: tablas `playlists` + `playlist_songs` (posición, PK compuesta, cascade). CRUD + agregar/quitar canciones con renumeración, reglas de acceso (privada = solo dueño, pública = visible)
- [x] **Favoritos**: tabla `user_favorites` + `GET/PUT/DELETE /me/favorites` y `GET /me/favorites/ids`. Corazón en cada canción (home, artista, favoritos, playlists) con estado optimista
- [x] **Covers**: `cover_key` + `cover_url` en álbumes, artistas y playlists (las canciones heredan el cover de su álbum — Fase 7); `POST /uploads/presign-cover` (solo WebP ≤ 256 KB, con `Cache-Control: immutable` de 1 año)
- [x] **UI kit ampliado**: `Select` (combobox accesible con teclado, opcionalmente buscable) y `BottomSheet` (panel inferior con backdrop, ESC, reduced-motion)
- [x] **Bottom-sheet del reproductor**: al tocar la barra inferior se abre la canción en grande (cover, progreso con seek, controles grandes, Media Session con artwork)
- [x] **Playlists en la UI**: `/dashboard/playlists` (listado + crear) y `/dashboard/playlists/[id]` (detalle con canciones reproducibles, borrar)
- [x] **Panel más útil**: stats del catálogo, últimas canciones con badge de cover, editor de cover por artista/álbum con descripción de peso (WebP ≤256 KB) y tamaño sugerido (800×800)
- [x] Migración 0004 aplicada y **45/45 tests** verdes (31 previos + 14 nuevos)
- [x] Ledger de tareas en [`tasks.md`](./tasks.md)

### Fase 3b — Vida de usuario, reproductor y PWA ✅

- [x] **Historial de reproducciones**: tabla `listens` + `POST /me/listens` (dedupe 30 s) + `GET /me/recently-played` (distintas, último play primero). El reproductor registra cada play automáticamente
- [x] **Ranking popular**: `GET /songs/popular` con `play_count` → sección "Populares ahora" en el dashboard
- [x] **Playlists de la comunidad**: `GET /playlists/public` (público, paginado) con autor (`owner_email`) → secciones "Playlists de la comunidad" en home y dashboard
- [x] **Home promocional** (rediseño Hallmark: atmospheric / Marquee Hero / nav píldora / footer statement): invita a registrarse, loguearse o escuchar el catálogo; con sesión redirige al dashboard
- [x] **Dashboard tipo Spotify**: sidebar (desktop) + drawer (móvil) en el área protegida, board con Seguí escuchando / Recién agregadas / Populares / Playlists de la comunidad, buscador (`/dashboard/search`) y recientes (`/dashboard/recently-played`)
- [x] **Reproductor propio**: barra con entrada animada y línea de progreso; fullscreen con cover, controles, tabs Ahora/Letra y descarga offline
- [x] **PWA**: service worker manual (shell offline + stale-while-revalidate + audio cache-first), manifest mejorado con shortcuts y **descarga de canciones a la Cache API** (reproducción sin stream; posible en Chrome/Android/desktop, limitada en iOS)
- [x] **Tests**: 55/55 de integración en la API + 16 unitarios del web (Vitest + RTL)

### Fase 4 — Perfil, plays, álbumes y colaboraciones ✅

- [x] **Perfil de usuario**: `username` (único) + foto de portada (WebP ≤ 256 KB vía presign-cover). Página `/account` (username + cover; el email es read-only; la contraseña no se edita desde la app: el login es email/usuario + password para cuentas existentes). Nav pública: botón "Mi cuenta" con ícono User → `/account`, sin link a Panel
- [x] **Contadores de plays**: cada play suma +1 a `songs.play_count` y +1 a `users.total_plays` (incrementos atómicos, respetando el dedupe). La canción muestra sus reproducciones
- [x] **Rankings en el dashboard**: "Más escuchadas esta semana" (`days=7`) y "Más escuchadas este mes" (`month=true`, mes calendario). Recientes con `user_play_count` por canción (badge N×) y sin llamadas API redundantes
- [x] **Playlists del sistema**: `playlists.kind` ('user'|'system'), generadas desde el panel (`/panel/playlists`) como snapshot de queries (`top_week`/`top_month`/`new`); públicas y primeras en el feed
- [x] **Álbumes**: feature `albums` (artista + cover), `songs.album_id` (SET NULL), CRUD admin, página pública `/album/[id]` y sección Álbumes en el artista
- [x] **Colaboradores**: `song_collaborators` (N:M), `SongRead.collaborators`, filtro `collaborator_id`, sección "Colaboraciones" en el artista; forms de canción (crear/editar) con álbum + colaboradores
- [x] Migraciones 0006/0007 aplicadas; **78/78 tests** de integración + 19 unitarios del web, typecheck y lint limpios

### Fase 5 — Mi catálogo, biblioteca y settings ✅

- [x] **Favoritos de álbumes y playlists**: tablas `user_favorite_albums`/`user_favorite_playlists` (PK compuesta, CASCADE) + `GET/PUT/DELETE /me/favorites/{albums,playlists}[/{id}]` y `GET /me/library/ids` (los 3 sets de likes en una llamada). Migración 0008
- [x] **Algoritmo de playlists del sistema**: `playlists.query` guarda la query del snapshot (`top_week`/`top_month`/`new`), `_snapshot_song_ids` centralizado y `POST /playlists/system/{id}/refresh` regenera sin duplicar
- [x] **Mi catálogo** (`/dashboard/catalogo`): canciones en lista (like/descargar/"+" a playlist), playlists propias + system likeadas + creación, álbumes likeados. `/dashboard/favorites` redirige acá
- [x] **PlaylistPicker** (`components/playlist-picker.tsx`): botón "+" en `SongItem` y en todas las `SongCard` (dropdown desktop + bottom sheet mobile, crear + agregar)
- [x] **Descarga = Cache API** (`OfflineButton compact`): guarda el audio en `pulse-offline-v1` para escuchar sin stream (sin endpoint nuevo en el backend)
- [x] **Explorar canciones** (`/dashboard/canciones`): grid con acciones + búsqueda + paginación (catálogo cacheado por tags)
- [x] **Playlist detail mejorado**: hero con cover + backdrop, play-all, like de playlists del sistema, editar/borrar por ownership real
- [x] **Sidebar reestructurado**: Mi catálogo primero · Biblioteca · Configuración (todos los usuarios) · chip de usuario eliminado (logout en Configuración) · top bar móvil con hamburguesa
- [x] **Configuración** (`/dashboard/configuracion`): Cuenta (`/account`) · Cache (peso con `storage.estimate` + eliminar, `clearOfflineCache()`) · Cerrar sesión
- [x] Migración 0008 aplicada; **91/91 tests** de integración + 35 unitarios del web, typecheck, lint y build limpios. Navegación optimizada (Suspense + skeletons + lazy fullscreen + `React.cache`)

### Fase 5.5 — Correcciones del catálogo y la biblioteca ✅

- [x] **PlaylistPicker "Ya está en esta playlist"**: `GET /me/playlists` expone `song_ids` por playlist (`MyPlaylistRead`) y las playlists que ya contienen la canción se muestran deshabilitadas con check (sin fetch extra)
- [x] **Cards de playlists compactas** en el catálogo (variante `compact` con cover chica)
- [x] **Catálogo**: la sección de canciones muestra solo las **10 más recientes** + botón "Ver todas" → `/catalog/songs` con **infinite scroll** (20/página, IntersectionObserver)
- [x] **Rutas en inglés top-level** fuera de `/dashboard`: `/catalog`, `/songs`, `/settings`, `/search`, `/playlists[/[id]]`, `/recently-played` (redirects de las URLs viejas; nav/proxy/manifest actualizados)
- [x] **Buscador de `/songs` arreglado**: causa raíz era que los services mandaban `query` cuando la API espera `q` (afectaba también a `/search`); ahora explora el catálogo público con `GET /songs?q=`
- [x] **95/95 tests** de integración + **37 unitarios** del web, typecheck, lint y build limpios

### Migración a Hono (Fases 0-4) — app con email/usuario + password

> Plan y estado en [`docs/hono_migration/`](./docs/hono_migration/). El código
> está listo para el cutover; el **deploy** queda bloqueado por credenciales
> externas.

- [x] **`apps/app-api`** (Hono + Cloudflare Workers): **login con email/username
      + password** (`POST /auth/login`, argon2id de pwdlib verificado con
      `@noble/hashes`), lecturas con paridad Python, escrituras de usuario
      (favoritos, playlists, listens/contadores, perfil) y presign de covers a
      R2. Contrato en `apps/app-api/openapi.json`.
- [x] **DB única local/prod**: Neon HTTP (`@neondatabase/serverless`); sin
      Hyperdrive ni `pg` en el Worker.
- [x] **Sin OAuth ni registro público**: las cuentas se crean con el seed del
      panel. Se eliminaron `/auth/google`, `oauth_accounts` y el link de Google.
- [x] **`apps/web` contra Hono**: `NEXT_PUBLIC_API_URL=http://localhost:8787`
      (prod `https://api.luisrivas.site`), cookie `session`, tipos generados en
      `packages/app-api-types` (`pnpm gen:types:app`).
- [x] **Login email/usuario/password**: `/login` muestra el formulario;
      `/register` redirige a `/login`; `/account` = username + cover (email
      read-only). Password auth requiere Workers Paid en producción (argon2 ~2 s
      CPU; Free 10 ms).
- [x] **Fix loop de sesión inválida**: el proxy ya no redirige `/login` →
      `/dashboard` solo por presencia de cookie; una cookie vencida/inválida va a
      `/login` y queda ahí (no parpadea).
- [x] **Cookies separadas**: app `session` (Hono) y panel `panel_session`
      (Python con `SESSION_COOKIE_NAME=panel_session`).
- [x] **Panel local** contra Python/R2/Neon (`apps/panel`, :3001) con todo el CRUD
      admin; no se despliega.
- [ ] **Deploy (bloqueado)**: Worker `api.luisrivas.site`, migración `0011` en
      `main`, app en Vercel y secrets de Cloudflare/Neon/R2. El workflow
      `.github/workflows/ci.yml` deploya en push a `master`. Pasos en
      [`docs/hono_migration/phase-4-cutover.md`](./docs/hono_migration/phase-4-cutover.md).

### Siguientes fases

- [ ] Fase 6 — Deploy: app en **Vercel**, API de la app en **Cloudflare Workers**
      (Custom Domain, Neon HTTP) y panel **local** contra la DB/R2 de prod.
      CSRF, notificaciones push, perfiles públicos, letra sincronizada
- [ ] Roadmap ampliado de features en [`tasks.md`](./tasks.md)

## Notas de seguridad pendientes antes de producción

- [ ] CSRF (double-submit cookie) en endpoints mutantes de Hono y Python — obligatorio con `SameSite=None` (ver `apps/api/app/core/security.py`)
- [ ] `slowapi` con storage Redis si el panel corre con más de un worker (local: no aplica)
- [ ] Revisar checklist completa del plan (sección 13)

## Acceso remoto opcional al panel (sin deploy)

```bash
cloudflared tunnel run pulse-stream-api          # expone :8000
uv run uvicorn app.main:app --reload             # en apps/api
```

Proteger el túnel con **Cloudflare Access**. El panel no se publica.