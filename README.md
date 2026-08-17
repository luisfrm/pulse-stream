# Pulse Stream 🎧

Spotify clone en monorepo. Stack: **pnpm workspaces · Next.js 16 · FastAPI (uv) · SQLAlchemy 2.0 async · Neon (Postgres serverless) · Cloudflare R2 · Tailwind v4 · PWA**.

> 📋 El plan completo de implementación está en [`plan-implementacion.md`](./plan-implementacion.md) y las reglas de arquitectura del backend en [`AGENTS.md`](./AGENTS.md). Leelos antes de tocar código.

## Estructura

```
pulse-stream/
├── apps/
│   ├── web/                      # Next.js 16 (App Router, Tailwind v4)
│   └── api/                      # FastAPI + uv (capas por feature)
├── packages/
│   ├── api-types/                # Tipos TS generados desde el OpenAPI de FastAPI
│   └── config/                   # tsconfigs compartidos
├── pnpm-workspace.yaml
├── package.json                  # scripts turbo
└── turbo.json
```

## Requisitos

- Node ≥ 20 (se usa 24) y pnpm ≥ 9 (se usa 11.5.3)
- [uv](https://docs.astral.sh/uv/) ≥ 0.6 y Python ≥ 3.13
- Una base **Postgres** (recomendado: [Neon](https://neon.tech), plan free) — no hay SQLite ni Docker en el flujo de desarrollo

## Setup

### 1. Backend (`apps/api`)

```bash
cd apps/api
cp .env.example .env   # completá las variables (ver tabla abajo)
uv sync --all-groups
uv run alembic upgrade head   # crea las tablas (usa la conexión directa)
uv run uvicorn app.main:app --reload   # http://localhost:8000
```

Swagger (solo en `ENV=local`): http://localhost:8000/docs

### 2. Frontend (`apps/web`)

```bash
cd apps/web
cp .env.example .env.local
pnpm install
pnpm dev   # http://localhost:3000
```

### 3. Tipos TS desde OpenAPI (regla de AGENTS.md)

Los tipos del frontend se **generan**, nunca se declaran a mano:

```bash
# con la API corriendo en :8000
pnpm gen:types   # regenera packages/api-types/src/generated.ts
```

### Scripts raíz

```bash
pnpm dev         # API + web (turbo)
pnpm build
pnpm lint
pnpm typecheck
pnpm test        # tests de la API (requieren TEST_DATABASE_URL)
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
| `TEST_DATABASE_URL` | solo tests | Base de tests (ej. branch efímera de Neon). Sin ella, `pytest` se salta |

### `apps/web/.env.local`

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | no (default `http://localhost:8000`) | URL base de la API FastAPI |

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
- [x] **Covers**: `cover_key` + `cover_url` en canciones, artistas y playlists; `POST /uploads/presign-cover` (JPG ≤ 512 KB)
- [x] **UI kit ampliado**: `Select` (combobox accesible con teclado, opcionalmente buscable) y `BottomSheet` (panel inferior con backdrop, ESC, reduced-motion)
- [x] **Bottom-sheet del reproductor**: al tocar la barra inferior se abre la canción en grande (cover, progreso con seek, controles grandes, Media Session con artwork)
- [x] **Playlists en la UI**: `/dashboard/playlists` (listado + crear) y `/dashboard/playlists/[id]` (detalle con canciones reproducibles, borrar)
- [x] **Panel más útil**: stats del catálogo, últimas canciones con badge de cover, editor de cover por artista/canción con descripción de peso (≤512 KB) y tamaño sugerido (600×600)
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

- [x] **Perfil de usuario**: `username` (único, en el registro con confirmación de contraseña) + foto de portada (JPG/WebP ≤ 512 KB vía presign-cover). Página `/account` (username/email/contraseña/cover). Nav pública: botón "Mi cuenta" con ícono User → `/account`, sin link a Panel
- [x] **Contadores de plays**: cada play suma +1 a `songs.play_count` y +1 a `users.total_plays` (incrementos atómicos, respetando el dedupe). La canción muestra sus reproducciones
- [x] **Rankings en el dashboard**: "Más escuchadas esta semana" (`days=7`) y "Más escuchadas este mes" (`month=true`, mes calendario). Recientes con `user_play_count` por canción (badge N×) y sin llamadas API redundantes
- [x] **Playlists del sistema**: `playlists.kind` ('user'|'system'), generadas desde el panel (`/panel/playlists`) como snapshot de queries (`top_week`/`top_month`/`new`); públicas y primeras en el feed
- [x] **Álbumes**: feature `albums` (artista + cover), `songs.album_id` (SET NULL), CRUD admin, página pública `/album/[id]` y sección Álbumes en el artista
- [x] **Colaboradores**: `song_collaborators` (N:M), `SongRead.collaborators`, filtro `collaborator_id`, sección "Colaboraciones" en el artista; forms de canción (crear/editar) con álbum + colaboradores
- [x] Migraciones 0006/0007 aplicadas; **78/78 tests** de integración + 19 unitarios del web, typecheck y lint limpios

### Siguientes fases

- [ ] Fase 5 — Deploy (Vercel + Railway/Fly/Render, dominio propio), CSRF, notificaciones push, perfiles públicos, letra sincronizada
- [ ] Roadmap ampliado de features en [`tasks.md`](./tasks.md)

## Notas de seguridad pendientes antes de producción

- [ ] CSRF (double-submit cookie / `fastapi-csrf-protect`) en endpoints mutantes — obligatorio con `SameSite=None` (ver `core/security.py`)
- [ ] `slowapi` con storage Redis si hay más de un worker
- [ ] Revisar checklist completa del plan (sección 13)
