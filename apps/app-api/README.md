# `@pulse-stream/app-api` — Hono en Cloudflare Workers

API de la app (`api.luisrivas.site`) según
[`docs/hono_migration`](../../docs/hono_migration/README.md). **Login con
email/usuario + contraseña**, lecturas con paridad Python, escrituras de usuario
(favoritos, playlists, listens/contadores, perfil) y presign de covers a R2.
Desde el cutover de la Fase 4, **`apps/web` apunta a esta API**; el panel sigue
contra Python.

**No hay OAuth ni registro público**: el seed del panel
(`apps/api/scripts/create_admin.py`) crea cuentas en **`panel_users`**, no en
`users`. Las cuentas de la app son las filas existentes en `users`; el alta
nueva llega con Better Auth (fase siguiente). El panel Python sigue siendo el
dueño del esquema (Alembic) y de la administración; esta API no corre
migraciones.

## Estructura

```
src/
├── index.ts                 # wiring de producción (env → createApp)
├── app.ts                   # createApp({ config, users, catalog, writes })
├── env.ts                   # Bindings/vars del Worker
├── config.ts                # parseo de env + cover_url
├── types.ts                 # AppBindings (config/users/catalog/writes/...)
├── auth/
│   ├── session.ts           # JWT HS256 (aud/iss "pulse-app", 7 días)
│   ├── cookies.ts           # cookie `session`
│   ├── password.ts          # verificación argon2id (pwdlib) con @noble/hashes
│   ├── guards.ts            # requireUser (cookie → JWT → repo)
│   └── routes.ts            # /auth/login, /auth/logout
├── features/users/
│   ├── schema.ts            # Zod UserRead
│   ├── repository.ts        # getById + findByIdentifier
│   ├── service.ts           # toUserRead
│   └── routes.ts            # GET/PATCH /users/me
├── db/
│   ├── schema.ts            # espejo Drizzle de users
│   ├── types.ts             # Queryable/QueryResult (sin pg)
│   └── client.ts            # Neon HTTP (local y prod)
└── lib/
    ├── errors.ts            # AppError + `{ detail }`
    └── …
```

## Comandos

```bash
pnpm install                       # en la raíz
pnpm --filter @pulse-stream/app-api dev        # wrangler dev (:8787)
pnpm --filter @pulse-stream/app-api typecheck  # tsc --noEmit
pnpm --filter @pulse-stream/app-api test       # vitest run
pnpm --filter @pulse-stream/app-api gen:openapi
pnpm --filter @pulse-stream/app-api deploy     # requiere credenciales reales
```

Tests en Node con `app.request()` y repos fake: no tocan Postgres ni red.

## Variables y secrets

`wrangler.jsonc` define las vars públicas y `env.prod` (vars + Custom Domain
`api.luisrivas.site`). Los secrets se cargan con `wrangler secret put`:

| Nombre | Uso |
|---|---|
| `AUTH_SECRET` | HS256 de `session` (≥ 32 chars) |
| `DATABASE_URL` | Conexión directa a Neon (sin `-pooler`) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | Firmado de covers |

`ENV` (`local` \| `dev` \| `prod`), `APP_URL`, `COOKIE_DOMAIN` (vacío = cookie
host-only), `CORS_ORIGINS` (coma-separado) y `R2_PUBLIC_BASE_URL` van como vars.

Local: copiar `.dev.vars.example` a `.dev.vars` (gitignored) y completar
`AUTH_SECRET` y `DATABASE_URL`.

**Driver de DB:** `db/client.ts` usa `@neondatabase/serverless` (HTTP) en local
y en producción. No hay `pg`, Hyperdrive ni `localConnectionString`. El driver
HTTP no soporta transacciones interactivas: las mutaciones multi-tabla se
escriben como una sola sentencia con CTEs.

## Contrato

| Método | Path | Respuesta |
|---|---|---|
| `GET` | `/health` | `200 {"status":"ok"}` |
| `POST` | `/auth/login` | `{identifier,password}` (email o username) → `204` + cookie `session`; `400` credenciales inválidas |
| `POST` | `/auth/logout` | `204` + cookie `session` expirada |
| `GET` | `/users/me` | `200 UserRead` o `401 {detail}` |
| `PATCH` | `/users/me` | `username`/`cover_key` → `200 UserRead` |
| `GET` | `/openapi.json` | documento OpenAPI 3.1 |

El resto del catálogo y las escrituras están documentados en
`apps/app-api/openapi.json` y en `docs/hono_migration/`.

Cookie `session`: `HttpOnly`, `Path=/`, `SameSite=Lax`, `Secure` si
`ENV !== "local"`, `Domain` si `COOKIE_DOMAIN` está seteado, `Max-Age=604800`.

## Decisiones

- **Un solo driver de DB** (Neon HTTP) para que local y producción no difieran.
- **Sin OAuth**: no hay `/auth/google`, `oauth_accounts` ni alta pública. El
  seed del panel crea `panel_users`; las cuentas de la app son filas de `users`
  (el alta nueva llega con Better Auth).
- **Login con password**: `POST /auth/login` busca por email o username
  (case-insensitive) y verifica argon2id de `pwdlib` con `@noble/hashes` (JS
  puro; `hash-wasm` falla en Workers). **Requiere Workers Paid en prod**
  (~2 s CPU por login; Free 10 ms).
- **Drizzle solo modela el esquema**; Alembic sigue siendo el dueño. Las queries
  son SQL parametrizado.
- **La app se construye por request**: `parseConfig` necesita los bindings del
  runtime. El registro de rutas es barato; la primera query abre el request HTTP
  a Neon.

## Deploy

El workflow `.github/workflows/ci.yml` corre tests y, en push a `master`,
migra Neon y ejecuta `wrangler deploy --env prod`. El Worker de producción se
llama `pulse-stream-app-api-prod` y se sirve en `api.luisrivas.site`.

Pendientes externos: secrets de Cloudflare/Neon/R2, migración `0012` en
`main`, seed del admin de panel y actualización de env de Vercel.
