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

### 3. API Worker (Hono/Cloudflare) — implementación que reemplaza a `apps/api`

`apps/api-worker` es el rewrite del backend sobre Cloudflare Workers (Hono +
Drizzle + Neon HTTP + better-auth + R2). `apps/api` queda como implementación
de referencia (el contrato OpenAPI y los tests de Python son la especificación).

```bash
cd apps/api-worker
cp .dev.vars.example .dev.vars   # completá DATABASE_URL, AUTH_SECRET, R2_*, ...
pnpm --filter @pulse-stream/api-worker dev   # http://localhost:8787
```

- **Puertos**: worker `:8787` (el que espera `apps/web/.env.local`),
  web `:3000`. `pnpm dev` en la raíz levanta los dos con turbo y **no**
  necesita la API de Python.
- **Docs**: `http://localhost:8787/docs` y `/openapi.json` (solo con
  `ENV=local`).
- **Migraciones**: se escriben a mano en `migrations/` y se aplican con
  `pnpm db:migrate`, que exige `MIGRATE_DATABASE_URL` (sin fallback) y
  `CONFIRM_TARGET=yes` si el destino no coincide con `TEST_DATABASE_URL`.
  `db:check` (sin drift) y `db:generate` son libres.
- **Auth**: better-auth con email+password; la sesión viaja en la cookie
  HttpOnly `session`. Las passwords legacy (argon2 de fastapi-users) no se
  migran: se resetean con `pnpm user:set-password`.
- **Uploads**: presign S3 (aws4fetch) para audio/covers; el import por ZIP de
  un álbum acepta **hasta 40 MB** (límite del body del Worker) y valida
  ZIP bombs, CRC y audio (parser propio, sin `mutagen`).
- **Contrato**: `pnpm --filter @pulse-stream/api-worker gen:contract` regenera
  el fixture de paridad y los tests comparan componentes + rutas/status/$ref.

### 4. Tipos TS desde OpenAPI (regla de AGENTS.md)

Los tipos del frontend se **generan**, nunca se declaran a mano:

```bash
pnpm gen:types          # desde la API Python (:8000)
pnpm gen:types:worker   # desde el Worker (:8787) — debe dar el MISMO archivo
```

El resultado del Worker tiene que ser idéntico al de Python (`generated.ts` es
el contrato que consume el web); las únicas diferencias documentadas son
`UserCreate`/`UserUpdate` (no aceptan campos de privilegio: desviación de
seguridad) y `PlaylistRead.kind` (enum inline equivalente al `$ref`, porque
zod no puede emitir `$ref` + `default`).

`gen:types:worker` ya **no necesita un server corriendo**: exporta el OpenAPI a
`apps/api-worker/openapi.json` (git-ignored) con el mismo `buildOpenApiDocument`
que sirve `/openapi.json`. En CI el archivo generado está *pinneado*:
`pnpm gen:types:worker && git diff --exit-code packages/api-types/src/generated.ts`.

## Cutover y rollback (Python → Worker)

**Corte duro, sin dual-run.** Los dos backends no comparten formato de usuario:

- los usuarios creados por Python **no tienen fila en `account`** (better-auth
  no puede autenticarlos) y los creados por el Worker tienen
  `hashed_password = NULL` (fastapi-users no puede autenticarlos).

Pasos:

1. Mergear la rama a `master` (el deploy del Worker se dispara con push a master).
2. Deployar el Worker con el workflow **Deploy API Worker** (o a mano con
   `pnpm --filter @pulse-stream/api-worker deploy`). El job corre migraciones,
   publica con `wrangler deploy`, sincroniza los 5 secrets de runtime desde
   GitHub y hace smoke de `/health`, `/genres` y `/artists`.
3. Verificar el smoke y recién entonces apuntar `apps/web` al Worker
   (`NEXT_PUBLIC_API_URL` + `ENV=prod` + `COOKIE_DOMAIN` en Vercel) y redeployar
   el web. Si cambiás la env antes de que el Worker esté arriba, el sitio queda
   apuntando a una API inexistente.
4. Resetear las passwords legacy, una por una:
   `pnpm --filter @pulse-stream/api-worker user:set-password -- --email ...`.
5. Smoke E2E: login, dashboard, play (contadores), like, playlist, búsqueda,
   settings, logout.

**Cookies viejas.** Un usuario con el JWT de fastapi-users todavía en el
navegador ya **no queda en loop**: el proxy ve la cookie, el layout recibe 401 y
redirige a `/api/logout`, que borra la cookie en una respuesta same-origin y
manda a `/login`.

**Rollback.** Volver a Python exige re-hashear cada usuario creado después del
corte (su password vive en `account.password`, no en `hashed_password`): es un
script de migración de datos, no un simple redeploy. Planificá el corte con una
ventana y un backup.

### Scripts raíz

```bash
pnpm dev         # worker (:8787) + web (:3000) con turbo
pnpm build
pnpm lint
pnpm typecheck
pnpm test        # tests del worker (requieren TEST_DATABASE_URL)
pnpm gen:types:worker
```

## CI/CD

| Workflow | Dispara | Qué corre | Secrets |
|---|---|---|---|
| `Tests` | **pull_request** | unitarios: worker `test:unit` (202) + web vitest (58). Sin red ni DB | ninguno |
| `CI (integración)` | **push a master** / manual | pytest + vitest de integración con Neon, typecheck/lint/build del web, dry-run del worker y `generated.ts` pinneado | repository: `TEST_DATABASE_URL`, `TEST_DATABASE_URL_WORKER` |
| `Deploy API Worker` | **push a master** (paths del worker) / manual | typecheck + unit + migraciones + `wrangler deploy` + sync de secrets + smoke | environment `production`: `CLOUDFLARE_API_TOKEN`, `MIGRATE_DATABASE_URL`, `DATABASE_URL`, `AUTH_SECRET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `RESEND_API_KEY`; variable `CLOUDFLARE_ACCOUNT_ID` |

**El web lo deploya Vercel** con su integración de Git; no hay workflow de deploy
web. Variables en Vercel (Production): `NEXT_PUBLIC_API_URL`,
`ENV=prod`, `COOKIE_DOMAIN`, `COOKIE_SAMESITE`.

**Config del Worker**: lo no secreto (`ENV`, `API_URL`, `CORS_ORIGIN_REGEX`,
`COOKIE_*`, `SESSION_COOKIE_NAME`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`,
`R2_PUBLIC_BASE_URL`, `EMAIL_FROM`, `WEB_APP_URL`) vive en
`apps/api-worker/wrangler.jsonc` (`vars` + `routes` del custom domain). Los
secretos de runtime los sincroniza el workflow con `wrangler secret bulk` en
cada deploy: GitHub es la fuente de verdad, así rotar un secreto es cambiarlo en
GitHub y volver a deployar.

Dos bases de test, a propósito: pytest hace `drop_all/create_all` (esquema
Alembic) y el Worker hace `TRUNCATE` sobre el esquema con better-auth; en la
misma base se rompen mutuamente.

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
| `NEXT_PUBLIC_API_URL` | sí en deploy | URL base de la API (`http://localhost:8787` en local; `https://pulse-stream-api.luisrivas.site` en prod). Se inlinea en build |
| `ENV` | no (default `local`) | `prod` en Vercel: la cookie de logout va con `Secure` |
| `COOKIE_DOMAIN` | en prod con subdominios | Dominio registrable (`luisrivas.site`) para que el borrado del logout matchee al del Worker |
| `COOKIE_SAMESITE` | no (default `lax`) | `none` solo si web y API están en dominios distintos |

### `apps/api-worker/.dev.vars`

Copia de `.dev.vars.example`. Claves: `ENV`, `AUTH_SECRET`, `DATABASE_URL`
(pooled, runtime), `TEST_DATABASE_URL_WORKER` (base de test propia),
`MIGRATE_DATABASE_URL` (Neon **directa**, único nombre que lee `db:migrate`),
`R2_*`, `COOKIE_*`, `RATE_LIMIT_*`, `API_URL` (`http://localhost:8787`).
En deploy los secretos van por el workflow (ver CI/CD); lo no secreto está en
`wrangler.jsonc`.

Email (reset de contraseña):

| Variable | Obligatoria en prod | Descripción |
|---|---|---|
| `RESEND_API_KEY` | **sí** (secret) | API key de Resend. Sin ella, en local el link de reset se loguea (`password_reset_link_local`) y no se manda mail |
| `EMAIL_FROM` | **sí** (var en `wrangler.jsonc`) | Remitente (`Pulse Stream <no-reply@luisrivas.site>`). El dominio tiene que estar **verificado** en Resend |
| `WEB_APP_URL` | **sí** (var en `wrangler.jsonc`) | Origin del web que arma el link `/reset-password?token=…` (default local: `http://localhost:3000`) |
| `RATE_LIMIT_FORGOT_PASSWORD` | no | Límite del envío de mails (default `5/hour`) |

### Recuperación de contraseña

`/login` tiene el botón **¿Olvidaste tu contraseña?**: usa el email del
formulario, llama a `POST /auth/forgot-password` y muestra un aviso con copy
condicional ("si existe una cuenta con…"). El endpoint responde **202 siempre**,
así que no se puede enumerar usuarios.

El mail (enviado por el Worker con **Resend REST**) apunta a
`https://<web>/reset-password?token=<token>`. El token de better-auth:

- vence a la **hora**;
- es de **un solo uso**;
- se **invalida el anterior** cada vez que se pide uno nuevo
  (`reset-password:%` en `verification`);
- al resetear se **revocan todas las sesiones** del usuario.

No hay endpoint de validación de token: si venció o ya se usó, el 400
`RESET_PASSWORD_BAD_TOKEN` aparece al enviar el formulario. La página manda
`Referrer-Policy: no-referrer` y `Cache-Control: no-store` (el token no debe
viajar en el `Referer` ni quedar cacheado).

Ojo con Resend: si el dominio de `EMAIL_FROM` no está verificado, el Worker
responde 202 igual y loguea `resend_failed` (no hay mail). En local, sin
`RESEND_API_KEY`, el link aparece en el log del worker.

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

- [x] **Perfil de usuario**: `username` (único, en el registro con confirmación de contraseña) + foto de portada (JPG/WebP ≤ 512 KB vía presign-cover). Página `/account` (username/email/contraseña/cover). Nav pública: botón "Mi cuenta" con ícono User → `/account`, sin link a Panel
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

### Siguientes fases

- [ ] Fase 6 — Deploy (Vercel + Railway/Fly/Render, dominio propio), CSRF, notificaciones push, perfiles públicos, letra sincronizada
- [ ] Roadmap ampliado de features en [`tasks.md`](./tasks.md)

## Notas de seguridad pendientes antes de producción

- [ ] CSRF (double-submit cookie / `fastapi-csrf-protect`) en endpoints mutantes — obligatorio con `SameSite=None` (ver `core/security.py`)
- [ ] `slowapi` con storage Redis si hay más de un worker
- [ ] Revisar checklist completa del plan (sección 13)

cloudflared tunnel run pulse-stream-api

uv run uvicorn app.main:app --reload