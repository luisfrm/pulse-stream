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

---

## 1. Backend (`apps/api`) — arquitectura en capas por feature

```
apps/api/app/
├── main.py                  # create_app(): CORS por regex + cookies, slowapi, AppError handler
├── core/                    # config.py (pydantic-settings), security.py, logging.py
├── db/                      # session.py (get_session), base.py (Base declarativa)
├── features/
│   ├── auth/                # fastapi-users: backend cookie JWT, manager, require_admin
│   ├── users/ · artists/ · songs/ · genres/ · playlists/ · favorites/ · uploads/
│   └── listens/             # historial de reproducciones (play + fecha)
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
`is_superuser` (endpoints mutantes de artists/songs/users). **CSRF sigue
pendiente** antes de producción (`SameSite=None` + `double-submit`).

**Migraciones Alembic:** se escriben **a mano** (no autogen), estilo
`0004_playlists_favorites_covers.py`: `revision: str = "0004"`,
`down_revision` encadenado. Nueva tabla → también hay que importar el modelo en
`apps/api/tests/conftest.py` (los tests registran `Base.metadata` manualmente)
y el `session` scope es único (config en `pyproject.toml`:
`asyncio_default_*_loop_scope = "session"`).

**Tests:** helpers en `apps/api/tests/helpers.py` — `register_and_login(client,
admin=...)` (admin se promueve por DB), `PASSWORD` constante. Patrón típico:
crear entidades vía API, assert status + shape del JSON.

---

## 2. Frontend (`apps/web`) — Next.js 16 App Router

**Grupos de rutas:**
- `(public)/` — home, `/login`, `/register`, `/artist/[id]`, `/song/[id]`. Sin
  sesión requerida. El home **redirige al dashboard si hay sesión**.
- `(protected)/` — `/dashboard/*`: cualquier sesión. Layout con **sidebar**
  (escritorio) + drawer (móvil) — reemplazó el top-nav viejo.
- `(panel)/` — `/panel/*`: solo `role=admin`. Sin sesión → `/login`; sin rol → `/`.

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

**Design system:** Tailwind v4 `@theme` en `app/globals.css` (único lugar de
tokens). Paleta oscura esmeralda en OKLCH (`--color-bg-base`, `--color-brand-*`)
+ fuentes **Bricolage Grotesque** (display) e **Inter** (body). **Preservar
estos tokens** — no crear paletas paralelas. Para diseño UI usar el skill
`.agents/skills/hallmark` (respeta los tokens existentes). No hay `design.md`.

**Reproductor** (`components/player/`): un único `<audio>` global en
`PlayerProvider` (montado en el root layout, sobrevive navegación). API vía
`usePlayer()`: `play(song, queue)`, `toggle`, `next`, `prev`, `seek`, más
`current/playing/progress/duration`. `PlayerBar` (barra inferior fija, animada)
abre `PlayerFullscreen` (pantalla completa con cover, controles y letra).
Media Session API integrada. El provider **registra cada play** (`POST
/me/listens`) cuando una canción empieza a reproducirse (solo con sesión).

**PWA:** `app/manifest.ts` (dinámico) + `public/sw.js` (service worker manual,
sin integración de build) registrado desde un client component. Descarga offline
= Cache API (fetch completo del audio con CORS → `caches`).

**UI kit** (`components/ui/`): `Button/Badge/Card/Input/Textarea/Title/Select/
BottomSheet` con `cva` + `cn` + `Slot` (asChild). Reutilizarlo; los 8 estados
(default/hover/focus/active/disabled/loading/error/success) son obligatorios.

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