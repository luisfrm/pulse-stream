# AGENTS.md — Pulse Stream

Spotify-clone en monorepo. Stack: **pnpm workspaces · turbo · Next.js 16 (App
Router, Tailwind v4) · FastAPI (uv) · SQLAlchemy 2.0 async · Neon (Postgres
serverless) · Cloudflare R2 · PWA**.

> Reglas de arquitectura del backend en la sección 1 (capas por feature) y del
> frontend en la sección 2. El plan de fases vive en `plan-implementacion.md`
> y el ledger de tareas en `tasks.md`.

---

## 0. Comandos (desde la raíz del monorepo)

```bash
pnpm dev                 # turbo: API (uvicorn :8000) + web (next :3000)
pnpm build               # turbo build (web = next build)
pnpm lint                # turbo lint (web = eslint)
pnpm typecheck           # turbo typecheck (web = tsc --noEmit)
pnpm test                # turbo test (API = pytest; requiere TEST_DATABASE_URL)
pnpm gen:types           # regenera packages/api-types/src/generated.ts desde
                         # http://localhost:8000/openapi.json (API corriendo)
```

Backend (en `apps/api`):
```bash
uv sync --all-groups
uv run alembic upgrade head
uv run uvicorn app.main:app --reload   # docs en /docs solo si ENV=local
uv run pytest                          # integración; exige TEST_DATABASE_URL
```

- Los tests de la API son **integración contra una Postgres real** apuntada por
  `TEST_DATABASE_URL`. Sin esa variable se **saltan** con un mensaje claro
  (`apps/api/tests/conftest.py`). No hay SQLite ni Docker en el flujo.
- Frontend usa **alias `@/*` → `apps/web/*`** (tsconfig paths).
- Solo un paquete: `pnpm --filter @pulse-stream/web <lint|typecheck|test|build>`
  (`test` del web = `vitest run`). El CI (`.github/workflows/ci.yml`) corre
  exactamente: API `uv run pytest` + web `typecheck → lint → build`.

---

## 1. Backend (`apps/api`) — arquitectura en capas por feature

```
apps/api/app/
├── main.py                  # create_app(): CORS por regex + cookies, slowapi, AppError handler
├── core/                    # config.py (pydantic-settings), security.py, logging.py
├── db/                      # session.py (get_session), base.py (Base declarativa)
├── features/
│   ├── auth/                # fastapi-users: backend cookie JWT, manager, require_admin
│   ├── users/ · artists/ · albums/ · songs/ · genres/ · playlists/ · favorites/
│   └── uploads/ · listens/  # uploads: presign R2; listens: historial + contadores
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

**Auth (fastapi-users):** cookie HttpOnly + JWT (nombre de cookie: `session`).
`current_user` exige sesión activa; `require_admin` exige `role=admin` o
`is_superuser` (endpoints mutantes de artists/albums/songs/users). SameSite de
la cookie: default `lax` (cubre localhost y subdominios del mismo dominio
registrable); `COOKIE_SAMESITE=none` solo si front y API viven en dominios
distintos. **CSRF sigue pendiente** antes de producción (double-submit); con
`lax` el vector cross-site queda mitigado, con `none` es obligatorio. Si front
y API son subdominios distintos (prod), seteá `COOKIE_DOMAIN` al dominio
registrable: sin eso la cookie es host-only de la API y el guard del front
(`proxy.ts`) nunca la ve → bucle en `/login?next=…` (en local funciona porque
el navegador comparte la cookie entre puertos de `localhost`).

**Logout = responsabilidad del web, no de la API.** `session` es HttpOnly
(solo una respuesta HTTP la borra) y la respuesta de `POST /auth/logout` es
cross-origin desde el browser (localhost:3000 → localhost:8000), así que el
Set-Cookie de la API puede no aplicarse y la sesión queda viva. El botón de
logout es un `<form method="POST" action="/api/logout">` (`app/api/logout/
route.ts`): el web emite el Set-Cookie de expiración en una respuesta
same-origin (dos variantes: host-only y con `Domain`) y responde 303 → `/login`
(navegación dura, el proxy re-corre sin cookie). Atributos leídos del env del
web con los MISMOS nombres que el backend (`ENV` → Secure si ≠ local,
`COOKIE_DOMAIN`, `COOKIE_SAMESITE`): si el API setea `COOKIE_DOMAIN`, el web
debe tener el mismo valor o el borrado no matchea. No llama a la API (JWT
stateless: borrar la cookie ES cerrar sesión). CSRF del logout = solo molesto
(te desloguea), mismo riesgo que la API; pendiente del work de CSRF general.

**Datos de Fase 4 (columnas y relaciones no obvias):**
- `playlists.kind` es VARCHAR `'user' | 'system'`. Las `system` son snapshots
  de queries (`top_week`/`top_month`/`new`) generadas por admin; **solo un admin
  las muta** (`service._get_mutable`) y el feed público las ordena primero.
- `songs.play_count` y `users.total_plays` se incrementan con UPDATEs atómicos
  en `listens.service.record_play` (respetando el dedupe de 30 s).
- `song_collaborators` (N:M canción↔artista): el filtro `collaborator_id` en
  `GET /songs` excluye al artista principal. `song_collaborators` **no usa
  `distinct()`** (PK compuesta no duplica; `distinct()` sobre `songs.*` rompe en
  Postgres por la columna JSON).
- `AlbumDetail` (con canciones) vive en `albums/router.py`, no en `schemas.py`,
  para evitar el ciclo de imports albums↔songs.
- Covers (canciones/artistas/álbumes/perfil) aceptan **JPG y WebP ≤ 512 KB**
  (`uploads.service.ALLOWED_COVER_TYPES` + `COVER_EXTENSIONS` para el
  `object_key`).

**Migraciones Alembic:** se escriben **a mano** (no autogen), estilo
`0007_albums_collaborators.py` (la más reciente): `revision: str = "0007"`,
`down_revision` encadenado (0001…0007). Nueva tabla → también hay que importar
el modelo en `apps/api/tests/conftest.py` (los tests registran
`Base.metadata` manualmente) y el `session` scope es único (config en
`pyproject.toml`: `asyncio_default_*_loop_scope = "session"`).

**Tests:** helpers en `apps/api/tests/helpers.py` — `register_and_login(client,
admin=...)` (admin se promueve por DB), `PASSWORD` constante. Patrón típico:
crear entidades vía API, assert status + shape del JSON.

---

## 2. Frontend (`apps/web`) — Next.js 16 App Router

**Grupos de rutas:**
- `(public)/` — home promocional, `/login`, `/register`. Sin sesión requerida;
  el home **redirige al dashboard si hay sesión**. Las páginas de detalle
  (artista/álbum/canción) NO viven acá: exigen sesión.
- `(protected)/` — `/dashboard/*`, `/account`, y las páginas de catálogo
  `/artist/[id]`, `/album/[id]`, `/song/[id]` (top-level, NO bajo `/dashboard`):
  cualquier sesión. Layout con **sidebar** (escritorio) + drawer (móvil).
  Nota: el `proxy.ts` matchea `/dashboard`, `/panel` y `/artist|/album|/song`;
  `/account` lo protege únicamente el layout.
- `(panel)/` — `/panel/*` (artists, songs, playlists) + detalles
  `/panel/artists/[id]`, `/panel/albums/[id]`, `/panel/songs/[id]`: solo
  `role=admin`. Sin sesión → `/login`; sin rol → `/`. **El panel NO linkea al
  sitio público**: artista/álbum/canción abren su página admin interna.
  **Flujo de alta de canciones: artista → álbum → canción.** Los álbumes se
  crean desde la página del artista (no hay nav ni página propia de álbumes).

**Guards:** `apps/web/proxy.ts` chequea **solo la presencia** de la cookie
`session` a nivel request. La validación REAL ocurre en los layouts vía
`sessionService.getSession()` (`GET /users/me`, nunca cacheado — `cache:
"no-store"`).

**Cliente API** (`lib/api/client.ts`): instancia `ofetch` isomórfica.
- Server (RSC/Server Action): reenvía la cookie del request vía `next/headers`
  en `onRequest`.
- Browser: `credentials: "include"`.
- Soporta `next: { revalidate, tags }` para cache tagging de Next 16.

**Servicios** (`lib/services/*.service.ts`): un archivo por dominio que wrappea
el cliente. Convenciones:
- Tipos **generados** desde OpenAPI (`packages/api-types/src/generated.ts` vía
  `pnpm gen:types`), re-exportados en `lib/services/types.ts`. **Nunca
  declarar tipos a mano.**
- `Page<T> = { items, total, offset, limit }` (paginación offset/limit).
- Datos por usuario (favoritos, playlists, biblioteca) **nunca se cachean**.
- Catálogo público se cachea por tags (`lib/services/tags.ts`) y se revalida con
  Server Actions `updateTag(CACHE_TAGS.x)` (patrón visto en las páginas de
  `dashboard/`).
- Géneros y roles llegan en minúscula desde la API (`"hip-hop"`, `"admin"`);
  para mostrar usar `formatGenre`/`formatRole` de `lib/utils/format.ts`
  (testeado en Vitest).

**Design system:** Tailwind v4 `@theme` en `app/globals.css` (único lugar de
tokens). Paleta oscura esmeralda en OKLCH (`--color-bg-base`, `--color-brand-*`)
+ fuentes **Bricolage Grotesque** (display) e **Inter** (body). **Preservar
estos tokens** — no crear paletas paralelas. Para diseño UI usar el skill
`.agents/skills/hallmark` (respeta los tokens existentes). No hay `design.md`.

**Reproductor** (`components/player/`): un único `<audio>` global en
`PlayerProvider` (montado en el root layout, sobrevive navegación). API vía
`usePlayer()`: `play(song, queue)`, `toggle`, `pause`, `next`, `prev`, `seek`,
más `current/playing/progress/duration`. `PlayerBar` (barra inferior fija,
animada) abre `PlayerFullscreen` (pantalla completa con cover, controles y
letra). Media Session API integrada. El provider **registra cada play** (`POST
/me/listens`) cuando una canción empieza a reproducirse.

> ⚠️ La cookie `session` es **HttpOnly** (`auth/backend.py`): NO se puede leer
> con `document.cookie`. No gates de sesión basados en cookies client-side (el
> `recordPlay` usa una marca en memoria y descarta el 401 de anónimos).

**Audio único en toda la app:** `components/player/audio-orchestrator.ts`
(`claimAudio`/`releaseAudio`) garantiza que **solo suene una fuente a la vez**:
el reproductor global y los previews del panel (`AudioPreviewPlayer`, que usan
`new Audio()` propio) compiten por el "turno" — empezar uno pausa el otro. No
crear más sistemas de audio sueltos sin pasar por el orquestador. El ecualizador
solo se muestra en la fuente activa.

**PWA:** `app/manifest.ts` (dinámico) + `public/sw.js` (service worker manual,
sin integración de build) registrado desde un client component. **En dev la SW
no se registra** (`pwa-register.tsx` la desregistra): su stale-while-revalidate
cachea chunks viejos de `/_next/static` → hydration mismatch y errores de
Turbopack (`chunk.reason.enqueueModel`). Si ves esos errores en dev, limpiá
`.next` y reiniciá el server. Descarga offline = Cache API (fetch completo del
audio con CORS → `caches`).

**UI kit** (`components/ui/`): `Button/Badge/Card/Input/Textarea/Title/Select/
BottomSheet/Dialog` con `cva` + `cn` + `Slot` (asChild). Reutilizarlo; los 8
estados (default/hover/focus/active/disabled/loading/error/success) son
obligatorios. El modal (`components/ui/modal.tsx`) es Radix Dialog
(`@radix-ui/react-dialog`, no el paquete unificado `radix-ui`): bottom sheet en
mobile (drag-to-close) + modal centrado en desktop; Radix lockea el scroll de
la página. **No poner `overflow-x: clip` en `html` en `globals.css`**: rompe la
propagación del overflow del body al viewport y el lock de scroll de los
modales deja de funcionar (la página scrollea con el modal abierto). El clip
horizontal vive solo en `body`.

---

## 3. Convenciones generales

- No mezclar capas (backend) ni mezclar data-fetch de servidor con estado
  cliente sin razón: RSC lee con `force-dynamic` para datos por usuario y con
  `revalidate`/tags para catálogo.
- Los tipos TS del frontend se generan desde OpenAPI, nunca a mano.
- Cambios a enums de dominio (roles, géneros) → solo en `schemas.py`.
- No inventar métricas/features: si un dato no existe en el backend, agregar el
  endpoint (no hardcodear en el front).
- `README.md` y `tasks.md` se actualizan cuando se cierra una fase/tarea.