# `@pulse-stream/app-api` — Hono en Cloudflare Workers

API de la app (`app.luisrivas.site`) según
[`docs/hono_migration`](../../docs/hono_migration/README.md). **Fase 0**:
fundación testeable, Google OAuth y `GET /users/me`. El catálogo y las
escrituras de usuario llegan en las fases 2/3.

El panel Python (`apps/api`) sigue siendo el dueño del esquema (Alembic) y de
la administración; esta API no corre migraciones.

## Estructura

```
src/
├── index.ts                 # wiring de producción (env → createApp)
├── app.ts                   # createApp({ config, users, google })
├── env.ts                   # Bindings/vars del Worker
├── config.ts                # parseo de env + cover_url
├── types.ts                 # AppBindings (config/users/google en Context)
├── auth/
│   ├── session.ts           # JWT HS256 (aud/iss "pulse-app", 7 días)
│   ├── cookies.ts           # `session` y `oauth_state` (atributos por ENV)
│   ├── google.ts            # state firmado + PKCE + exchange + ID token
│   ├── guards.ts            # requireUser (cookie → JWT → repo)
│   └── routes.ts            # /auth/google[/callback], /auth/logout
├── features/users/
│   ├── schema.ts            # Zod UserRead (contrato público)
│   ├── repository.ts        # interfaz + PgUserRepository (SQL parametrizado)
│   ├── service.ts           # resolveGoogleUser + toUserRead
│   └── routes.ts            # GET /users/me
├── db/
│   ├── schema.ts            # espejo Drizzle de users + oauth_accounts
│   └── client.ts            # pg.Client por request (Hyperdrive | DATABASE_URL)
└── lib/
    ├── errors.ts            # AppError + `{ detail }`
    ├── redirect.ts          # saneo de returnTo
    └── username.ts          # username desde email + colisiones
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

Tests en Node con `app.request()` y un repo fake: no tocan Postgres ni Google
(la red se inyecta por `createGoogleClient({ fetch, verifyIdToken })`).

## Variables y secrets

`wrangler.jsonc` define las vars públicas y el binding Hyperdrive
(`REPLACE_WITH_HYPERDRIVE_ID` es un placeholder). Los secrets se cargan con
`wrangler secret put`:

| Nombre | Uso |
|---|---|
| `AUTH_SECRET` | HS256 de `session` y `oauth_state` (≥ 32 chars) |
| `GOOGLE_CLIENT_ID` | OAuth client de Google |
| `GOOGLE_CLIENT_SECRET` | idem |
| `GOOGLE_REDIRECT_URI` | debe coincidir con el Authorized redirect URI |

`ENV` (`local` \| `dev` \| `prod`), `APP_URL`, `COOKIE_DOMAIN` (vacío = cookie
host-only), `CORS_ORIGINS` (coma-separado) y `R2_PUBLIC_BASE_URL` van como vars.

Local: copiar `.dev.vars.example` a `.dev.vars` (gitignored) y completar
`AUTH_SECRET`, credenciales de Google y `DATABASE_URL`. Si no hay Hyperdrive
local, comentar el bloque `hyperdrive` de `wrangler.jsonc` para que
`db/client.ts` use `DATABASE_URL`, o dejar el binding y exportar
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://..."`

**Driver de DB local:** con `ENV=local` + `DATABASE_URL`, `db/client.ts` usa
`@neondatabase/serverless` (HTTP) porque `pg` sobre TCP no completa la conexión
en Miniflare. En `dev`/`prod` usa `pg` + Hyperdrive (el camino de producción).
El resto del código (repositorios, SQL) es idéntico.

## Contrato (Fase 0)

| Método | Path | Respuesta |
|---|---|---|
| `GET` | `/health` | `200 {"status":"ok"}` |
| `GET` | `/auth/google?returnTo=/dashboard` | `302` a Google + cookie `oauth_state` (10 min) |
| `GET` | `/auth/google/callback?code&state` | verifica state/PKCE/ID token, setea `session` y redirige a `APP_URL + returnTo` |
| `POST` | `/auth/logout` | `204` + cookie `session` expirada |
| `GET` | `/users/me` | `200 UserRead` o `401 {detail}` |
| `GET` | `/openapi.json` | documento OpenAPI 3.1 |

`returnTo` solo acepta paths internos: empieza con `/`, no `//`, sin `\`, sin
esquema ni caracteres de control; cualquier otro valor cae a `/dashboard`.

Cookie `session`: `HttpOnly`, `Path=/`, `SameSite=Lax`, `Secure` si
`ENV !== "local"`, `Domain` si `COOKIE_DOMAIN` está seteado, `Max-Age=604800`.

## Decisiones de la Fase 0

- **Zod 4 + `@hono/zod-openapi` 1.x**: la versión instalada declara peer
  `zod ^4`, así que se usa `z.uuid()` / `z.email()` de Zod 4 sin capa de
  compatibilidad. El hook de validación devuelve `{ detail: "Invalid request" }`
  (nunca el error crudo de Zod).
- **`createApp` recibe dependencias**: los tests pasan un `UserRepository` fake;
  producción pasa una factory `(env) => PgUserRepository` con un `pg.Client` por
  request. El cierre del cliente se agenda con `ctx.waitUntil` en el middleware
  (y cae a un no-op en `app.request()`).
- **`oauth_state` es un JWT firmado**, no solo el state plano: transporta el
  `code_verifier` de PKCE y el `returnTo` sin estado en el servidor.
- **El email es la identidad de vinculación**: si ya existe un usuario con ese
  email, el login de Google linkea `oauth_accounts` sin tocar `role`,
  `username` ni `hashed_password` (una cuenta admin del panel conserva sus
  permisos). Usuarios nuevos: `hashed_password=NULL`, `is_verified=true`,
  `role=NULL`, username derivado del local-part.
- **Drizzle solo modela el esquema**; Alembic sigue siendo el dueño. Las queries
  de Fase 0 son SQL parametrizado con `pg` (menos superficie y sin depender de
  que `drizzle-kit pull` esté corriendo).
- **La app se construye por request**: `parseConfig` necesita los bindings del
  runtime y el `pg.Client` es por request. El registro de rutas es barato y la
  conexión se abre recién en la primera query.

## Pendientes externos (bloqueos)

- Migración `0010` en `apps/api` (`hashed_password` nullable + `oauth_accounts`).
  Sin ella el alta OAuth falla contra la DB.
- Crear el Hyperdrive config y reemplazar `REPLACE_WITH_HYPERDRIVE_ID`.
- Crear el OAuth Client en Google Cloud Console y cargar los secrets.
- CSRF sigue pendiente a nivel producto (mismo estado que la API Python); el
  callback OAuth usa `state` + cookie `SameSite=Lax`.
