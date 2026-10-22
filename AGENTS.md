# AGENTS.md — Pulse Stream

Spotify-clone en monorepo. Stack: **pnpm workspaces · turbo · Next.js 16 (App
Router, Tailwind v4) · Hono en Cloudflare Workers (`apps/app-api`) · FastAPI (uv,
solo panel local) · SQLAlchemy 2.0 async · Neon (Postgres serverless) · Cloudflare
R2 · PWA · login con email/usuario + contraseña**.

> Reglas de arquitectura del backend en la sección 1 (capas por feature) y del
> frontend en la sección 2. El plan de fases vive en `plan-implementacion.md`
> y el ledger de tareas en `tasks.md`.

---

## 0. Comandos (desde la raíz del monorepo)

```bash
pnpm dev                 # turbo dev: app-api (:8787) + web (:3000) + panel (:3001)
pnpm build               # turbo build (web + panel)
pnpm lint                # turbo lint (web + panel)
pnpm typecheck           # turbo typecheck (apps + packages)
pnpm test                # turbo test (web + panel + packages; las APIs usan sus suites)
pnpm gen:types           # regenera packages/api-types (Python/panel) desde
                         # http://localhost:8000/openapi.json (API corriendo)
pnpm gen:types:app       # regenera packages/app-api-types (Hono/web) desde
                         # apps/app-api/openapi.json (no requiere levantar el Worker)
pnpm db:migrate          # alembic upgrade head usando apps/api/.env
                         # (DATABASE_URL_DIRECT; por defecto la DB de desarrollo)
pnpm db:current          # revisión Alembic aplicada
pnpm db:rollback         # baja una migración (cuidado: puede perder datos)
```

> El frontend está partido en **dos apps Next** (`apps/web` y `apps/panel`) que
> comparten `packages/{ui,design,api-client,shared}`. Desde la Fase 4 del
> cutover, **`apps/web` habla con Hono** (`apps/app-api`: `:8787` local /
> `https://api.luisrivas.site`) y **`apps/panel` sigue 100% contra Python**
> (`apps/api`, `:8000`, local).

Backend Hono (en `apps/app-api`):
```bash
pnpm --filter @pulse-stream/app-api dev        # wrangler dev (:8787)
pnpm --filter @pulse-stream/app-api typecheck
pnpm --filter @pulse-stream/app-api test
```

Backend panel (en `apps/api`):
```bash
uv sync --all-groups
uv run alembic upgrade head
uv run uvicorn app.main:app --reload   # docs en /docs solo si ENV=local
uv run pytest                          # integración; exige TEST_DATABASE_URL
```

- Los tests de la API son **integración contra una Postgres real** apuntada por
  `TEST_DATABASE_URL`. Sin esa variable se **saltan** con un mensaje claro
  (`apps/api/tests/conftest.py`). No hay SQLite ni Docker en el flujo.
- Frontend usa **alias `@/*` → la raíz de cada app** (`apps/web/*` /
  `apps/panel/*`) y los paquetes se importan como `@pulse-stream/*`.
- Paquetes compartidos (TS fuente, sin build; cada app los transpila con
  `transpilePackages`):
  - `@pulse-stream/ui` — UI kit, `BrandLogo`, `AuthBackground`,
    `FullScreenLoader`, `CoverUploader`, `Pagination`, `SearchInput`, hooks.
  - `@pulse-stream/design` — `tokens.css` (único lugar de tokens Tailwind v4).
  - `@pulse-stream/api-client` — `createApiClient({baseURL, cookieName})`,
    `uploadToR2`, `COVER_CACHE_CONTROL`.
  - `@pulse-stream/shared` — formato, errores, `CACHE_TAGS`, `Page<T>`,
    orquestador de audio.
- Filtros: `pnpm --filter @pulse-stream/{web,panel} <lint|typecheck|test|build>`.
  El `test` del frontend es `vitest run` (web, panel, shared y api-client). El CI
  (`.github/workflows/ci.yml`) corre API `uv run pytest` + typecheck → lint →
  build de web y panel.

---

## 1. Backend — `apps/app-api` (Hono, app) + `apps/api` (FastAPI, panel)

**Dos APIs desde la Fase 4:**

- **`apps/app-api`** (Hono + Cloudflare Workers) — API de la app: login con
  email/usuario + contraseña, lecturas del catálogo y escrituras de usuario
  (favoritos, playlists, listens, perfil, presign de covers). La consume
  `apps/web`. Contrato versionado en `apps/app-api/openapi.json`; espeja los
  schemas de Python (mismos nombres). **DB: Neon HTTP (`@neondatabase/serverless`)
  en local y prod; no Hyperdrive ni `pg`.** Las mutaciones multi-tabla son una
  sola sentencia con CTEs (el driver HTTP no tiene transacciones interactivas).
- **`apps/api`** (FastAPI + SQLAlchemy async) — **solo panel/admin local**: dueño
  del esquema (Alembic) y de las mutaciones admin (artists/albums/songs, ZIP,
  playlists system). La consume `apps/panel` y no se despliega.

La arquitectura en capas de abajo aplica a `apps/api` (y se refleja en los
features de Hono: `routes.ts` / `service.ts` / `repository.ts` / `schema.ts`).

## 1.1 `apps/api` (Python) — arquitectura en capas por feature

```
apps/api/app/
├── main.py                  # create_app(): CORS por regex + cookies, slowapi, AppError handler
├── core/                    # config.py (pydantic-settings), security.py, logging.py
├── db/                      # session.py (get_session), base.py (Base declarativa)
├── features/
│   ├── auth/                # fastapi-users: backend cookie JWT, manager, require_admin
│   ├── users/               # users (app) + panel_users (auth del panel) + /init
│   ├── artists/ · albums/ · songs/ · genres/ · playlists/
│   └── uploads/ · listens/  # uploads: presign R2; listens: modelos/ranking
│                            # (los endpoints /me/* viven en Hono)
└── shared/                  # pagination.py, exceptions.py
```

| Capa | Responsabilidad | Nunca hace |
|---|---|---|
| `router.py` | Solo HTTP: parsea input, llama al `service`, devuelve el `schema` de salida. | Lógica de negocio ni SQL. |
| `service.py` | Reglas de negocio; orquesta uno o más `repository`. | Nada de HTTP ni SQL directo. |
| `repository.py` | Únicamente queries SQLAlchemy. | Reglas de negocio ni permisos. |
| `models.py` | Tablas SQLAlchemy. | Exponerse en una response (siempre se mapea a `schema`). |
| `schemas.py` | Contratos Pydantic. Enums/Literal de validación viven acá, **nunca** como `sa.Enum` en `models.py`. | — |

**Reglas que se violan fácil:**

- **Enums solo en Pydantic**: las columnas son `VARCHAR`/`JSON`/`TEXT` planas.
  `role` es `null` (usuario normal) o `"admin"`; `genres` es una columna JSON de
  strings. Cambiar valores permitidos = tocar solo `schemas.py`, nunca una
  migración.
- **Routers con `if`/`else` de negocio → mover a `service.py`.**
- **Nunca exponer un modelo SQLAlchemy en la response** — mapear a Pydantic
  (`ConfigDict(from_attributes=True)`). Las URLs calculadas (`stream_url`,
  `cover_url`) son propiedades del modelo leídas por el schema.
- Los `repository` se inyectan por constructor con `Depends()` (DI ligero de
  FastAPI, sin contenedor externo). Patrón: `get_x_repository()` como factory.

**Auth (Python, panel):** fastapi-users autentica **solo contra `panel_users`**
(no contra `users`). Esas cuentas son administradores del panel local y no
poseen playlists/favoritos/listens. No hay registro público:
`/auth/register`, reset-password y verificación de email fueron removidos. El
bootstrap es `GET /init/status` + `POST /init` (crea el primer admin solo si
`panel_users` está vacío; 409 si ya existe). `POST /init` se permite solo en
`ENV=local` desde loopback o con `INIT_TOKEN` + header `X-Init-Token` (ver
`PENDING.md`). El seed/CLI (`scripts/create_admin.py`) también escribe en
`panel_users`.

La cookie es HttpOnly + JWT; el nombre por defecto es `session`, pero **en local
el panel usa `panel_session`** (`SESSION_COOKIE_NAME=panel_session`) para no
chocar con la cookie `session` que emite Hono en localhost. `current_user` exige
sesión activa; **`require_admin` exige `role="admin"` y nada más**
(`is_superuser` existe porque fastapi-users lo exige, pero siempre es False y NO
autoriza). SameSite de la cookie: default `lax` (cubre localhost y subdominios
del mismo dominio registrable); `COOKIE_SAMESITE=none` solo si front y API viven
en dominios distintos. **CSRF sigue pendiente** antes de producción
(double-submit); con `lax` el vector cross-site queda mitigado, con `none` es
obligatorio. Si front y API son subdominios distintos (prod), seteá
`COOKIE_DOMAIN` al dominio registrable: sin eso la cookie es host-only de la API
y el guard del front (`proxy.ts`) nunca la ve → bucle en `/login?next=…` (en
local funciona porque el navegador comparte la cookie entre puertos de
`localhost`).

**Auth de la app (Hono, `apps/app-api`):** **solo email/usuario + contraseña**,
todavía con el auth custom (JWT + argon2) sobre `users.hashed_password`.
- **Login**: `POST /auth/login` acepta `{identifier, password}` donde
  `identifier` es email o username (case-insensitive). Verifica el hash argon2id
  de `pwdlib` con `@noble/hashes` (JS puro; `hash-wasm` no compila WASM en
  Workers). Setea la cookie `session` (`HttpOnly`, `Path=/`, `SameSite=Lax`,
  `Secure` si `ENV !== local`, `Domain=COOKIE_DOMAIN` en prod).
- **Split de usuarios (migración 0012)**: `panel_users` es del panel/admin;
  `users` es la tabla pública de la app y el target de playlists/favoritos/
  listens. Las cuentas nuevas del panel viven solo en `panel_users` (no son
  usuarios de la app); los admins copiados por 0012 conservan además su fila
  legacy en `users`. No hay OAuth ni registro público; las cuentas de la app son
  las filas existentes en `users` (el alta nueva llega con Better Auth).
  No re-introducir `/auth/google` ni `oauth_accounts`.
- ⚠️ **Password auth requiere Workers Paid en producción**: argon2 (64 MB,
  3 pasadas) tarda ~2 s de CPU en JS puro y Free limita a 10 ms. En local
  (`wrangler dev`) funciona sin ese límite.

**Logout = responsabilidad del web, no de la API.** `session` es HttpOnly
(solo una respuesta HTTP la borra) y la respuesta de `POST /auth/logout` es
cross-origin desde el browser (localhost:3000 → localhost:8787), así que el
Set-Cookie de la API puede no aplicarse y la sesión queda viva. El botón de
logout es un `<form method="POST" action="/api/logout">` (`app/api/logout/
route.ts`): el web emite el Set-Cookie de expiración en una respuesta
same-origin (dos variantes: host-only y con `Domain`) y responde 303 → `/login`
(navegación dura, el proxy re-corre sin cookie). Atributos leídos del env del
web con los MISMOS nombres que el backend Hono (`ENV` → Secure si ≠ local,
`COOKIE_DOMAIN`, `COOKIE_SAMESITE`): si el API setea `COOKIE_DOMAIN`, el web
debe tener el mismo valor o el borrado no matchea. No llama a la API (JWT
stateless: borrar la cookie ES cerrar sesión). CSRF del logout = solo molesto
(te desloguea), mismo riesgo que la API; pendiente del work de CSRF general.
El panel (`apps/panel`) tiene su propio route handler que borra
`panel_session`.

**Datos de Fase 4 (columnas y relaciones no obvias):**
- `playlists.kind` es VARCHAR `'user' | 'system'`. Las `system` son snapshots
  de queries (`top_week`/`top_month`/`new`) generadas por admin y **pertenecen
  al usuario fijo del sistema** (`00000000-0000-4000-8000-000000000001`,
  `system@pulse-stream.app`, sin password e inactivo), no al admin que las crea.
  `owner_email` es NULL para `kind='system'` en Python y Hono. El panel las
  muta con `role=admin` (no por ownership); los usuarios de la app NO pueden
  mutarlas (ni un admin legacy de Hono). El feed público las ordena primero. El
  usuario de sistema está protegido por un event ORM `before_delete`
  (`SystemUserProtectedError`) y nunca se borra en el downgrade de `0012`.
- `songs.play_count` y `users.total_plays` se incrementan en Hono
  (`writes/repository`) con CTEs atómicas, respetando el dedupe de 30 s. Python
  conserva los modelos/repos de listens para los snapshots, pero ya no expone
  `/me/listens` (es API de la app).
- `song_collaborators` (N:M canción↔artista): el filtro `collaborator_id` en
  `GET /songs` excluye al artista principal. `song_collaborators` **no usa
  `distinct()`** (PK compuesta no duplica; `distinct()` sobre `songs.*` rompe en
  Postgres por la columna JSON).
- `AlbumDetail` (con canciones) vive en `albums/router.py`, no en `schemas.py`,
  para evitar el ciclo de imports albums↔songs.
- Covers (artistas/álbumes/playlists/perfil; **las canciones NO tienen cover
  propio**) aceptan **solo WebP ≤ 256 KB** (`uploads.service.ALLOWED_COVER_TYPES`
  + `COVER_EXTENSIONS` para el `object_key`). El presign firma `Cache-Control:
  public, max-age=31536000, immutable` (keys con UUID = inmutables) y el front
  lo envía en el PUT (`uploadToR2`); mismo header en los `covers/*` históricos
  vía `scripts/backfill_cover_cache.py`. OJO: el edge de Cloudflare puede
  capar el TTL (regla de 4h vista en prod) — si el `cf-cache-status: HIT`
  sirve `max-age=14400`, agregar Cache Rule en el dashboard para `/covers/*`
  (Edge + Browser TTL 1 año). Sugerido en el panel: **800×800 WebP q~75**.
- **Toda canción requiere álbum** (`SongCreate.album_id` obligatorio: crearlo
  sin `album_id` es `422` de Pydantic; quitarlo con `PATCH {album_id:null}` es
  `400` `AlbumRequiredError`, migración `0009` dropeó `songs.cover_key`):
  `Song.cover_url` resuelve `album.cover_key` (misma URL para todo el álbum =
  1 descarga; `Song.album` ya viene con selectinload). Canciones legacy sin
  álbum quedan sin cover hasta asignarles uno. Borrar un álbum con canciones =
  400 `AlbumHasSongsError` (reasignar primero).
- **Import por ZIP de álbumes** (`POST /albums/{id}/import-zip`, admin):
  excepción deliberada a "el audio nunca pasa por FastAPI" — el ZIP viaja por
  la API (carga masiva), pero cada audio se guarda en R2 con PUT server-side
  (`R2Storage.put_object`, mismas credenciales que firman). `ZipImportService`
  (uploads feature, orquesta repos de songs+albums) valida .mp3/.aac (≤ 50 MB,
  no vacíos), lee **título + duración de los tags ID3 con `mutagen`** (fallback:
  filename), saltea duplicados por título (case-insensitive) y no-audio, y crea
  cada canción con `artist_id`/`album_id` del álbum (el cover se hereda).
  Respuesta
  `ZipImportResult` (`imported` songs, `skipped`/`failed` issues) — un archivo
  que falla no aborta el resto. Botón "Importar ZIP" en el `AlbumManager` del
  panel.

**Datos de Fase 5 (biblioteca / favoritos / snapshots):**
- Favoritos = **3 tablas** (`user_favorites` canciones, `user_favorite_albums`,
  `user_favorite_playlists`), PK compuesta user+item, `created_at` (el orden de
  listado es por fecha de like, no por título). `GET /me/library/ids` devuelve
  los 3 sets (`{song_ids, album_ids, playlist_ids}`) en UNA llamada para pintar
  corazones sin traer listas.
- Endpoints (Hono, app): `GET/PUT/DELETE /me/favorites/{albums,playlists}[/{id}]`
  (+ `/ids`). El like a una playlist **system no la muta**: la tabla es solo el
  marcador del usuario (el contenido solo lo cambia el panel admin por Python).
- `playlists.query` (VARCHAR, Fase 5): la query de snapshot que generó una
  playlist `system` (`top_week`/`top_month`/`new`). `create_system_playlist`
  guarda la query y `POST /playlists/system/{id}/refresh` (panel admin) la
  regenera **sin duplicar** (`replace_songs`: delete + insert con posiciones
  0..n-1). Si la query es NULL (playlist creada antes de la 0008) o inválida →
  400 `PlaylistNotRefreshableError`. Algoritmo en `service._snapshot_song_ids`:
  top_week = últimos 7 días, top_month = mes calendario, new = `created_at`
  desc; unicidad de song_ids garantizada por el group by.
- **`PlaylistDetail`/`PlaylistRead` con `songs` exigen eager-load de
  `Song.album`** (`playlists/repository._with_songs`): `SongRead.album` se
  valida en la response y sin `selectinload(Song.album)` se rompe con
  `MissingGreenlet` en async (bug real ya corregido). La regla aplica a
  **cualquier query Python que devuelva `Song`**; el bug original se cazó en el
  extinto `GET /me/favorites` (hoy ese endpoint es de Hono).
- **No hay endpoint de descarga** (`Content-Disposition`) — decisión de
  producto: el web descarga con la Cache API (`lib/offline.ts`). No re-introducir
  `download_url`/`presign_get_download`.

**Migraciones Alembic:** se escriben **a mano** (no autogen), estilo
`0012_panel_users_and_system_user.py` (la más reciente): `revision: str = "0012"`,
`down_revision` encadenado (0001…0012). Nueva tabla → también
hay que importar el modelo en `apps/api/tests/conftest.py` (los tests
registran `Base.metadata` manualmente) y el `session` scope es único (config
en `pyproject.toml`: `asyncio_default_*_loop_scope = "session"`).

**Tests:** helpers en `apps/api/tests/helpers.py` — `register_and_login(client,
admin=..., session=...)` crea una cuenta en `panel_users` (no hay registro) y
hace login; `create_panel_user`/`create_app_user`/`create_user_playlist`/
`add_listen` siembran datos de panel y de app directamente en DB. `PASSWORD`
constante. Patrón típico: crear entidades vía API, assert status + shape del
JSON. Los tests de migraciones usan un schema descartable (`ALEMBIC_SCHEMA`).

---

## 2. Frontend — `apps/web` (app) + `apps/panel` (admin) + `packages/*`

**Split (Fases 1 y 4):** `apps/web` es la app de música (player, PWA, catálogo,
biblioteca) y `apps/panel` el backoffice admin local (`/panel/*`, login propio
email/password contra Python). Son dos apps Next independientes que comparten:

- `packages/ui` — `components/ui/*` (Button, Badge, Card, Input, Textarea,
  Title, Select, Checkbox, FileInput, Modal, BottomSheet, Skeleton, Sonner),
  `BrandLogo`, `AuthBackground`, `FullScreenLoader`, `CoverUploader`,
  `Pagination`, `SearchInput`, `useIsMobile`/`useDebounce` y `cn`.
- `packages/design` — `tokens.css` con TODO el `@theme`, utilidades
  (`bg-brand-gradient`), keyframes `ps-*`, `eq-bar`, `card-lift`, `bg-blooms`,
  `prefers-reduced-motion`, body/inputs/scrollbars.
- `packages/api-client` — `createApiClient({baseURL, cookieName})` isomórfico,
  `ApiFetchOptions` (`next: { revalidate, tags }`), `uploadToR2`,
  `COVER_CACHE_CONTROL`.
- `packages/shared` — `format*`, `friendlyError`, `CACHE_TAGS`, `Page<T>` y el
  orquestador de audio (TS puro; cada app tiene su instancia).
- `packages/api-types` — tipos generados desde el OpenAPI de **Python**
  (`pnpm gen:types`; panel).
- `packages/app-api-types` — tipos generados desde el OpenAPI de **Hono**
  (`pnpm gen:types:app`; app). Ambos solo se importan como `type` (no necesitan
  `transpilePackages`).

Cada app tiene su `proxy.ts`, su `app/api/logout/route.ts`, su `fonts.ts`
(`next/font` se resuelve por app) y su `globals.css`:

```css
@import "tailwindcss";
@import "@pulse-stream/design/tokens.css";
@source "../../../packages/ui/src";
```

No crear paletas paralelas: los tokens viven SOLO en `packages/design`.
`next.config.ts` de ambas apps declara `transpilePackages` con los 4 paquetes.

**Cookies (Fase 4):** son **dos cookies separadas**. La app usa `SESSION_COOKIE`
(default `session`), que emite Hono; el panel usa `PANEL_SESSION_COOKIE`
(default **`panel_session`**), que emite Python con
`SESSION_COOKIE_NAME=panel_session`. Eso evita que en localhost la app y el
panel compartan sesión (mismo host, puertos distintos). El api-client reenvía
SOLO la cookie configurada, no todas. En prod, `COOKIE_DOMAIN` del web debe
coincidir con el del Worker (`luisrivas.site`). Los links cruzados que quedan
(panel → cuenta / playlist) usan `NEXT_PUBLIC_APP_URL` (default
`http://localhost:3000`).

**Env por app (local):** web → `NEXT_PUBLIC_API_URL=http://localhost:8787`
(Hono), `SESSION_COOKIE=session`, `ENV/COOKIE_DOMAIN/COOKIE_SAMESITE`; panel →
`NEXT_PUBLIC_API_URL=http://localhost:8000` (Python),
`PANEL_SESSION_COOKIE=panel_session`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`
y los mismos `ENV/COOKIE_*` para el borrado de cookie del logout. En prod el web
usa `NEXT_PUBLIC_API_URL=https://api.luisrivas.site`. El Python local debe
correr con `SESSION_COOKIE_NAME=panel_session` (`apps/api/.env`).

### `apps/web` — rutas
- `(public)/` — home promocional, `/login`, `/register`. Sin sesión requerida;
  el home **redirige al dashboard si hay sesión**. Las páginas de detalle
  (artista/álbum/canción) NO viven acá: exigen sesión.
  `/login` ofrece un formulario de email/usuario + contraseña
  (`POST /auth/login` de Hono, cookie `session`) y conserva `next`.
  `/register` **redirige a `/login`**: no hay registro público; las cuentas de
  la app son las filas existentes en `users` (el alta nueva llega con Better
  Auth; el seed del panel crea `panel_users`, no cuentas de la app). `/account`
  (protegida) muestra el email **read-only** y solo deja editar `username` +
  cover (sin contraseña).
- `(protected)/` — `/dashboard` (Inicio), `/account`, las páginas de catálogo
  `/artist/[id]`, `/album/[id]`, `/song/[id]` y las rutas top-level en inglés
  `/catalog`, `/catalog/songs`, `/songs`, `/search`, `/playlists[/[id]]`,
  `/recently-played`, `/settings` (NO bajo `/dashboard`): cualquier sesión.
  Layout con **sidebar** (escritorio) + drawer (móvil).
  Nota: el `proxy.ts` de la app matchea `/dashboard`, `/artist|/album|/song` y
  las rutas top-level (`/catalog`, `/songs`, `/settings`, `/search`,
  `/playlists`, `/recently-played`); `/account` lo protege únicamente el layout.
  **`/panel` NO se matchea en la app** (el panel es otra app).
  Las URLs viejas `/dashboard/{catalogo,canciones,configuracion,search,
  playlists,recently-played,favorites}` quedaron como páginas `redirect()`.

**Navegación (Fase 5.5):** el sidebar vive en `components/dashboard-shell.tsx`
(una sola `SidebarNav` compartida entre drawer móvil y sidebar desktop; una
top bar móvil `lg:hidden` con hamburguesa abre el drawer — el avatar de la
bottom nav ya no lo hace). Grupos y orden: **Principal** = Inicio · Buscar;
**Biblioteca** = Mi catálogo (`/catalog`) · Canciones (`/songs` — explorar
catálogo) · Playlists · Recientes;
**Administración** = Configuración (`/settings`, **todos** los usuarios). El
**Panel admin ya no vive en la app**: se accede a `apps/panel` (app Next local
contra Python; no se despliega). El chip de usuario al pie del sidebar se
eliminó (logout vive en Configuración). Bottom nav
(`components/bottom-nav.tsx`): Catálogo · Buscar · Cuenta (`/account`, Link) ·
Crear+.

- **Mi catálogo** (`/catalog`, `force-dynamic`): 3 secciones — Canciones en
  lista (`SongItem` con like/descargar/"+", SOLO las 10 más recientes + "Ver
  todas" → `/catalog/songs`), Playlists (propias + system likeadas + crear +
  "Ver todas", cards **compactas**), Álbumes likeados (`album-card.tsx`).
  Búsqueda con `q` (filtra dentro de la biblioteca).
  `/dashboard/favorites` quedó como `redirect` → `/catalog`.
- **Tus canciones** (`/catalog/songs`, `force-dynamic`): TODAS las canciones
  agregadas (favoritos) con **infinite scroll** — `songs-list.tsx` (client)
  usa IntersectionObserver sobre un sentinel y pagina `GET /me/favorites`
  offset/limit de a 20; `loading.tsx` propio + estado vacío.
- **Explorar canciones** (`/songs`): catálogo completo vía `GET /songs?q=`
  (cache tags, `revalidate: 60`) con estado en URL (`SearchInput`). Separación
  conceptual: `/catalog` = biblioteca del usuario; `/songs` = catálogo público.
- **PlaylistPicker** (`components/playlist-picker.tsx`): el botón "+" de
  agregar a playlist — popover propio en desktop + `BottomSheet` en mobile,
  lista playlists del usuario + "Nueva playlist" (crear+agregar). Las
  playlists llegan con `song_ids` (`GET /me/playlists` → `MyPlaylistRead`):
  **el servicio del web DEBE pegar a `/me/playlists`, NO a `/playlists`** (ese
  devuelve `PlaylistRead` sin `song_ids`; bug real ya corregido en
  `playlists-service.getMyPlaylists` — sin `song_ids` el toggle se rompe en
  silencio y siempre agrega). Cada fila es un **toggle**: si la canción ya está
  se muestra con **check verde redondeado + "Ya está en esta playlist"** y el
  click la **quita** de la playlist (sin fetch extra); si no está, la agrega.
  Se usa en `SongActions` y en
  `SongCard` (props OPCIONALES `playlists`/`favoriteIds`/`onMutated`; sin
  props no renderiza nada — el home público queda intacto).
- **Descargar = Cache API, sin endpoint**: el botón descarga reusa
  `OfflineButton` (prop `compact` para icono solo) → guarda el audio en la
  Cache API (`lib/offline.ts`, `OFFLINE_CACHE = pulse-offline-v1`). El peso y
  el borrado de cache viven en `/settings`
  (`clearOfflineCache()` + `getOfflineCacheSize()`; NO toca `pulse-shell-v1`
  del SW).
### `apps/panel` — admin (`:3001`)

- `app/panel/**` — `/panel` (home), `/panel/artists[/id]`, `/panel/albums/[id]`,
  `/panel/songs[/id|/new]`, `/panel/playlists`: solo `role=admin`. Sin sesión →
  `/login?next=…`; sin rol → home de la app (`NEXT_PUBLIC_APP_URL`).
  **Flujo de alta de canciones: artista → álbum → canción.** Los álbumes se
  crean desde la página del artista (no hay nav ni página propia de álbumes).
- `app/login` — formulario email/password propio (sin register); `next` param.
  La app también tiene su propio login con password contra Hono, pero el panel
  conserva su login contra Python. La cookie es `panel_session`
  (Python `SESSION_COOKIE_NAME=panel_session`).
- `app/api/logout/route.ts` — borra la cookie del panel (`PANEL_SESSION_COOKIE`)
  y redirige 303 a `/login`.
- `proxy.ts` — matchea `/panel/:path*` y `/login`; chequea solo la presencia de
  la cookie `panel_session`. La validación real (sesión + rol) está en
  `app/panel/layout.tsx` vía `getSession()` (Python).
- `components/` — `PanelShell`, `AudioPreviewPlayer`, `CoverUploader` (wrapper
  con el presign del panel) y `PanelCardSkeleton`.
- `lib/services/` — admin: songs/albums/artists, genres, uploads (audio +
  cover), playlists system (`createSystem`/`refreshSystem`), admin users.
- Layout **lean**: sin `PlayerProvider`, `PlayerBar`, PWA/SW, `Analytics` ni
  `Toaster` (errores inline). `force-dynamic` en toda página con datos.
- No linkea al sitio público salvo "Mi cuenta" y "ver playlist", que cruzan a
  `NEXT_PUBLIC_APP_URL`. Artista/álbum/canción abren su página admin interna.

**Guards:** cada app tiene su `proxy.ts`, que chequea **solo la presencia** de
su cookie (`SESSION_COOKIE` en web, `PANEL_SESSION_COOKIE` en panel). La
validación REAL ocurre en los layouts vía `getSession()` (`GET /users/me`, nunca
cacheado entre requests — `cache: "no-store"`; deduplicada con `React.cache`
dentro del mismo request). En el panel el layout exige además `role="admin"`
(`is_superuser` no autoriza) y redirige a `/init` si `panel_users` está vacío.

**Carga y navegación (page transitions):** los layouts de las áreas protegidas
(`apps/web/app/(protected)/layout.tsx` y `apps/panel/app/panel/layout.tsx`) **NO
son async**: envuelven el shell (`ProtectedShell`/`PanelGate`) en `<Suspense
fallback={<FullScreenLoader/>}>` y la sesión + redirect siguen siendo
server-side en el componente hijo — el full-screen solo aparece en la entrada
al área (post-login/hard load), no en cada navegación. El nav público
(`app/(public)/layout.tsx`) resuelve la sesión en un
`<Suspense fallback={<PillSkeleton/>}>` para no bloquear el primer chunk.

- `getSession` (`lib/services/session-service.ts`) está envuelta en
  `React.cache()`: deduplica `GET /users/me` DENTRO del mismo request (layout +
  página = 1 sola llamada). Se mantiene `sessionService.getSession` como wrapper
  por compat; en el server usá `getSession` directo.
- **Skeletons por página** (patrón estándar de loading): primitiva en
  `packages/ui/src/components/ui/skeleton.tsx` (`cva`+`cn`, variantes
  `default`/`elevated`/`brand`, shapes `rect`/`circle`/`pill`, `aria-hidden`)
  exportada desde `@pulse-stream/ui`; composiciones de la app en
  `apps/web/components/loading-skeletons.tsx` (`MediaCardSkeleton`,
  `SongItemSkeleton`, `SectionGridSkeleton`) y `PanelCardSkeleton` en
  `apps/panel/components/loading-skeletons.tsx`. Cada ruta con datos tiene su
  `loading.tsx`.
- **Streaming por sección**: el dashboard usa `<Suspense>` por sección (cada
  sección es un componente async propio en `dashboard/page.tsx`) y `search`
  envuelve solo los resultados (el input queda fuera para no perder foco).
- **Paralelismo**: las páginas resuelven sesión + datos con `Promise.all`
  (dashboard, catalogo, artist/album/playlist detail, home público y cada
  página del panel).
- **`PlayerFullscreen` lazy** (`next/dynamic`, `ssr: false` en
  `components/player/player-bar.tsx`): el fullscreen (con OfflineButton + letra)
  no viaja en el chunk del root layout ni se descarga en páginas que nunca lo
  abren.
- `error.tsx` branded por área: `apps/web/app/(protected)/error.tsx` y
  `apps/panel/app/panel/error.tsx`.
- `packages/design/tokens.css`: `.animate-pulse` vive en el bloque
  `prefers-reduced-motion` (los skeletons respetan reduced motion).
  `packages/ui/src/components/ui/button.tsx`: `loading` muestra `Loader2`
  spinner + `aria-busy`.

**Cliente API** (`packages/api-client`): `createApiClient({baseURL, cookieName})`
devuelve una instancia `ofetch` isomórfica. Cada app la crea en su
`lib/api/client.ts`:
- `apps/web` → `SESSION_COOKIE` (default `session`) + `NEXT_PUBLIC_API_URL` de
  **Hono**, exporta `api`.
- `apps/panel` → `PANEL_SESSION_COOKIE` (default `panel_session`) +
  `NEXT_PUBLIC_API_URL` de **Python**, exporta `panelApi`.
- Server (RSC/Server Action): reenvía SOLO la cookie configurada vía
  `next/headers` en `onRequest` (no todas las cookies).
- Browser: `credentials: "include"`.
- Soporta `next: { revalidate, tags }` para cache tagging de Next 16.

**Servicios** (`lib/services/*.service.ts`): un archivo por dominio que wrappea
el cliente de su app. Convenciones:
- Tipos **generados** desde OpenAPI, nunca a mano. La app usa
  `@pulse-stream/app-api-types` (`packages/app-api-types/src/generated.ts` vía
  `pnpm gen:types:app`, desde `apps/app-api/openapi.json`); el panel usa
  `@pulse-stream/api-types` (`pnpm gen:types`, desde `:8000/openapi.json`).
  Cada app los re-exporta en su `lib/services/types.ts`. Los schemas de Hono
  espejan los nombres de Python (`UserRead`, `SongRead`, etc.), así que el
  mapeo es 1:1.
- `Page<T>` se importa de `@pulse-stream/shared` / `@pulse-stream/api-client`.
- **Separación por audiencia**: `apps/web/lib/services` tiene lecturas de
  catálogo, favoritos, biblioteca, playlists de usuario, listens, auth, session
  y uploads (solo presign de cover). Las mutaciones admin
  (`createSong/updateSong/deleteSong`, albums CRUD/importZip, artists CRUD,
  playlists system, `admin/users`, `presignUpload` de audio) viven en
  `apps/panel/lib/services`.
- Datos por usuario (favoritos, playlists, biblioteca) **nunca se cachean**.
- Catálogo público se cachea por tags (`CACHE_TAGS` de `@pulse-stream/shared`) y
  se revalida con Server Actions `updateTag(CACHE_TAGS.x)` (patrón visto en las
  páginas de `dashboard/` y del panel).
- Géneros y roles llegan en minúscula desde la API (`"hip-hop"`, `"admin"`);
  para mostrar usar `formatGenre`/`formatRole` de `@pulse-stream/shared`
  (testeado en Vitest).

**Design system:** Tailwind v4 `@theme` en
`packages/design/tokens.css` (ÚNICO lugar de tokens). Paleta oscura esmeralda en
OKLCH (`--color-bg-base`, `--color-brand-*`) + fuentes **Bricolage Grotesque**
(display) e **Inter** (body). Cada `globals.css` importa Tailwind, los tokens y
declara `@source "../../../packages/ui/src"`. **Preservar estos tokens** — no
crear paletas paralelas. Para diseño UI usar el skill `.agents/skills/hallmark`
(respeta los tokens existentes). No hay `design.md`.

**Reproductor** (`apps/web/components/player/`): un único `<audio>` global en
`PlayerProvider` (montado en el root layout de la app, sobrevive navegación).
API vía `usePlayer()`: `play(song, queue)`, `toggle`, `pause`, `next`, `prev`,
`seek`, más `current/playing/progress/duration`. `PlayerBar` (barra inferior
fija, animada) abre `PlayerFullscreen` (pantalla completa con cover, controles y
letra). Media Session API integrada. El provider **registra cada play** (`POST
/me/listens`) cuando una canción empieza a reproducirse. El panel NO monta el
player global.

> ⚠️ La cookie de sesión es **HttpOnly** (la emite Hono en
> `apps/app-api/src/auth/cookies.ts`): NO se puede leer con `document.cookie`.
> No gates de sesión basados en cookies client-side (el `recordPlay` usa una
> marca en memoria y descarta el 401 de anónimos).

**Audio único:** `packages/shared/src/audio-orchestrator.ts`
(`claimAudio`/`releaseAudio`) garantiza que **solo suene una fuente a la vez**
dentro de cada app. Cada app tiene su propia instancia del módulo: la app la usa
para el reproductor global, el panel para sus `AudioPreviewPlayer` (que usan
`new Audio()` propio). No crear más sistemas de audio sueltos sin pasar por el
orquestador. El ecualizador solo se muestra en la fuente activa.

**PWA (solo app):** `apps/web/app/manifest.ts` (dinámico) + `public/sw.js`
(service worker manual, sin integración de build) registrado desde un client
component. **En dev la SW no se registra** (`pwa-register.tsx` la desregistra):
su stale-while-revalidate cachea chunks viejos de `/_next/static` → hydration
mismatch y errores de Turbopack (`chunk.reason.enqueueModel`). Si ves esos
errores en dev, limpiá `.next` y reiniciá el server. Descarga offline = Cache
API (fetch completo del audio con CORS → `caches`). El panel NO registra SW.

**UI kit** (`packages/ui/src/components/ui/`): `Button/Badge/Card/Input/
Textarea/Title/Select/Checkbox/FileInput/BottomSheet/Dialog/Skeleton/Sonner` con
`cva` + `cn` + `Slot` (asChild). Reutilizarlo; los 8 estados
(default/hover/focus/active/disabled/loading/error/success) son obligatorios.
`CoverUploader` es compartido y recibe `presign`/`upload`/`cacheControl` por
props (cada app inyecta su presign y el `uploadToR2` del api-client). El modal
(`packages/ui/src/components/ui/modal.tsx`) es Radix Dialog
(`@radix-ui/react-dialog`, no el paquete unificado `radix-ui`): bottom sheet en
mobile (drag-to-close) + modal centrado en desktop; Radix lockea el scroll de
la página. **No poner `overflow-x: clip` en `html` en `globals.css`**: rompe la
propagación del overflow del body al viewport y el lock de scroll de los
modales deja de funcionar (la página scrollea con el modal abierto). El clip
horizontal vive solo en `body` (en `packages/design/tokens.css`).

---

## 3. Convenciones generales

- `apps/web` y `apps/panel` **no se importan entre sí**: todo lo compartido vive
  en `packages/*` (y cada app tiene sus Server Actions, servicios y `proxy.ts`).
- No mezclar capas (backend) ni mezclar data-fetch de servidor con estado
  cliente sin razón: RSC lee con `force-dynamic` para datos por usuario y con
  `revalidate`/tags para catálogo.
- Los tipos TS del frontend se generan desde OpenAPI, nunca a mano:
  `pnpm gen:types:app` (Hono → `packages/app-api-types`) para `apps/web` y
  `pnpm gen:types` (Python → `packages/api-types`) para `apps/panel`.
- **La app solo admite email/usuario + contraseña**; no hay OAuth ni registro
  público. No re-introducir Google OAuth, registro con contraseña ni `PATCH` de
  email/password en `apps/web`. Las cuentas de la app viven en `users` (el seed
  `create_admin.py` crea admins en `panel_users`, no usuarios de la app). El
  alta/normalización de usuarios de la app se define con Better Auth en la fase
  siguiente. Password auth requiere Workers Paid en producción (argon2 > 10 ms
  CPU); el panel conserva email/password contra Python.
- Cambios a enums de dominio (roles, géneros) → en Python solo `schemas.py` y en
  Hono solo los schemas Zod; ambos contratos deben quedar espejados.
- No inventar métricas/features: si un dato no existe en el backend, agregar el
  endpoint (no hardcodear en el front).
- `README.md` y `tasks.md` se actualizan cuando se cierra una fase/tarea.