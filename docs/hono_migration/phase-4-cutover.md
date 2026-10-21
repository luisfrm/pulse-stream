# Fase 4 — Cutover: password-only, Neon HTTP y deploy

**Objetivo:** poner la app en producción con Hono, login **email/usuario +
contraseña** (sin OAuth), un solo driver de DB (Neon HTTP) y deploy automático
en push a `master`; Python queda solo para el panel local.

## Precondiciones

- Fases 0-3 verdes.
- Migración `0011` aplicada en Neon `main` (dropea `oauth_accounts`; `0010` sigue
  siendo histórica).
- Cloudflare: Worker + Custom Domain `api.luisrivas.site`; zona
  `luisrivas.site` activa.
- Vercel: proyecto `apps/web`, env vars de producción.
- Secrets de GitHub: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `DATABASE_URL` (Neon directo), `AUTH_SECRET`, `R2_*`.
- Workers Paid para que el login con password funcione en producción.

## Cambios en la app

- Login: solo formulario email/usuario + contraseña (`POST /auth/login` de Hono).
  No hay “Continuar con Google”.
- `/register`: redirige a `/login`; no hay registro público. Las cuentas se crean
  con el seed del panel.
- `/account`: email read-only, sin password; solo username + cover.
- `authService`: `login({identifier,password})` + `updateMe`; se eliminó
  `googleAuthUrl`.
- `getSession`: `GET /users/me` contra `api.luisrivas.site`.
- `proxy.ts`: cookie `session`; sin `/panel`.
- Servicios: todos los de la app contra Hono.
- Quitar el link “Panel admin” del sidebar/bottom nav.

## Cambios en el panel

- `SESSION_COOKIE_NAME=panel_session` en `.env`.
- `PANEL_SESSION_COOKIE=panel_session` en el front.
- `DATABASE_ENV=prod` para el banner cuando apunta a Neon main.
- Seed del admin:
  `uv run python scripts/create_admin.py --email ... --password ... --username ...`.
- El panel no se despliega; corre local. Acceso remoto opcional:
  `cloudflared tunnel` + Cloudflare Access.

## Cambios en la API Hono

- `db/client.ts`: **Neon HTTP** (`@neondatabase/serverless`) en local y prod.
  Sin `pg`, Hyperdrive ni `localConnectionString`.
- Mutaciones multi-tabla: una sola sentencia con CTEs (no hay transacciones
  interactivas en el driver HTTP).
- `/auth/login`: busca por email/username (case-insensitive), verifica argon2id
  de `pwdlib` con `@noble/hashes` y setea la cookie `session`.
- Eliminados: `/auth/google`, `/auth/google/callback`, `oauth_state`,
  `resolveGoogleUser`, `oauth_accounts` y el modelo Drizzle asociado.
- `packages/app-api-types`: regenerado desde `apps/app-api/openapi.json`
  (`pnpm gen:types:app`), sin las rutas de Google.

## Deploy automático

`.github/workflows/ci.yml`:

1. En push a `master` (y PRs) corre Python, app-api y web/panel.
2. Si todo pasa y el evento es push a `master`, el job `deploy`:
   - `uv run alembic upgrade head` contra Neon `main` (conexión directa);
   - `wrangler deploy --env prod` (Worker `pulse-stream-app-api-prod`);
   - sincroniza los secrets del Worker con `wrangler secret put --env prod`.
3. Vercel deploya `apps/web` con su integración Git en el mismo push.

El seed del admin **no** corre en cada push (rota la password): se ejecuta una
vez a mano.

## Variables

| Servicio | Variables |
|---|---|
| Worker | `ENV=prod`, `APP_URL=https://pulse-stream.luisrivas.site`, `COOKIE_DOMAIN=luisrivas.site`, `CORS_ORIGINS=https://pulse-stream.luisrivas.site`, `R2_PUBLIC_BASE_URL`; secrets `DATABASE_URL`, `AUTH_SECRET`, `R2_*` |
| Vercel | `NEXT_PUBLIC_API_URL=https://api.luisrivas.site`, `COOKIE_DOMAIN=luisrivas.site`, `ENV=prod` |
| Python local | `SESSION_COOKIE_NAME=panel_session`, `DATABASE_URL` main, `DATABASE_URL_DIRECT`, `R2_*`, `AUTH_SECRET` (panel) |
| Panel local | `NEXT_PUBLIC_API_URL=http://localhost:8000`, `PANEL_SESSION_COOKIE=panel_session`, `DATABASE_ENV=prod` |

## Verificación

- `curl https://api.luisrivas.site/health`.
- Login con email y con username en una ventana privada; cookie `session` con
  `Domain=.luisrivas.site`; logout.
- `GET /users/me` desde el server y el browser.
- Like, playlist, play, recientes, cuenta.
- Panel local: login, alta de artista/álbum, ZIP, presign de audio; la app ve el
  contenido nuevo en ≤60-120 s.
- Playwright: smoke E2E contra producción.
- Workers Logs: sin 1102; CPU p99 < 8 ms.
- Neon: queries/latencia y compute.

## Rollback

- Worker: `wrangler rollback` a la versión anterior.
- Vercel: promover el deployment anterior.
- La migración `0011` solo dropea `oauth_accounts` (sin datos en prod); el
  rollback de Alembic la recrea.
- La app no depende de Python en producción.

## Criterios de cierre

- [ ] Migración `0011` aplicada en `main`.
- [ ] Worker desplegado en `api.luisrivas.site`.
- [ ] Web en `pulse-stream.luisrivas.site` apuntando a la API.
- [ ] Login password (email + username) y cookie compartida.
- [ ] Seed del admin hecho una vez.
- [ ] Playwright/smoke de producción verde.
- [ ] Sin errores 1102 en Workers Logs.
