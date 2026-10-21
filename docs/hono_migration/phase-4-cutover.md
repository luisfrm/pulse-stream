# Fase 4 — Cutover: deploy, OAuth en la app y documentación

**Objetivo:** poner la app en producción con Hono + Google OAuth, dejar Python
solo para el panel local, y actualizar la documentación del repo.

## Precondiciones

- Fase 0-3 verdes.
- Migración 0010 aplicada en Neon `main` (aprobación explícita).
- Google OAuth Client creado (Web application) con redirect URIs:
  - `https://api.luisrivas.site/auth/google/callback`
  - `http://localhost:8787/auth/google/callback`
- Cloudflare: Worker + Hyperdrive + Custom Domain `api.luisrivas.site`.
- Vercel: proyecto `apps/web`, env vars.
- DNS Cloudflare: `app` CNAME a Vercel (DNS-only), `api` Custom Domain del Worker.

## Cambios en la app

- Login: “Continuar con Google” **+** formulario email/usuario y contraseña
  (`POST /auth/login` de Hono). El alta nueva sigue siendo Google.
- `/register`: redirige a login (la cuenta nueva se crea con Google).
- `/account`: email read-only, sin password; solo username + cover.
- `authService`: `googleAuthUrl` + `login({identifier,password})`; el logout
  sigue siendo el route handler same-origin `/api/logout`.
- `getSession`: `appApi('/users/me')` contra `api.luisrivas.site`.
- `proxy.ts`: cookie `session`; sin `/panel`.
- Servicios: todos los de la app contra Hono.
- Quitar el link “Panel admin” del sidebar/bottom nav.

## Cambios en el panel

- `SESSION_COOKIE_NAME=panel_session` en `.env`.
- `PANEL_SESSION_COOKIE=panel_session` en el front.
- `DATABASE_ENV=prod` para el banner cuando apunta a Neon main.
- Seed del admin: `uv run python scripts/create_admin.py --email ... --password ...`.
- El panel no se despliega; corre local. Acceso remoto opcional:
  `cloudflared tunnel` + Cloudflare Access.

## Cambios de código (app)

- `apps/web/lib/api/client.ts`: `NEXT_PUBLIC_API_URL` pasa a la API Hono
  (`http://localhost:8787` local, `https://api.luisrivas.site` prod); cookie
  `session`.
- `auth-service`: `googleAuthUrl(returnTo)` +
  `login({identifier,password})` (email o username).
- `/login`: botón “Continuar con Google” **y** formulario email/usuario +
  contraseña (`LoginForm`); `/register` redirige a `/login` (alta nueva por
  Google; el password es para cuentas existentes).
- **Hono `POST /auth/login`**: busca por email/username (case-insensitive) y
  verifica argon2id de `pwdlib` con `@noble/hashes` (JS puro; `hash-wasm` no
  compila WASM en Workers). Setea la misma cookie `session`. Usuarios OAuth-only
  (`hashed_password=NULL`) no pueden usar password. **Requiere Workers Paid en
  prod** (argon2 ~2 s CPU; Free 10 ms).
- **Fix loop**: `apps/web/proxy.ts` ya no redirige `/login` → `/dashboard` solo
  por presencia de cookie; una cookie vencida/inválida va a `/login` y queda ahí
  (antes: dashboard→login→dashboard infinito).
- `/account`: email read-only, sin password; solo username + cover. `updateMe`
  manda únicamente `username`/`cover_key`.
- `session-service`: `GET /users/me` contra Hono; `proxy.ts` sigue chequeando
  `session`; el logout same-origin no cambia.
- Servicios de la app (songs/albums/artists/playlists/favorites/listens/
  uploads): todos contra Hono. `presign-cover` usa el endpoint de Fase 3.
- `packages/app-api-types`: generar desde `apps/app-api/openapi.json`
  (`openapi-typescript`) y usarlo en `apps/web/lib/services/types.ts`. El panel
  conserva `@pulse-stream/api-types` (Python).
- Env local: web `NEXT_PUBLIC_API_URL=http://localhost:8787`; Hono
  `APP_URL=http://localhost:3000`; panel `SESSION_COOKIE_NAME=panel_session` +
  `PANEL_SESSION_COOKIE=panel_session` (así la cookie del panel no choca con la
  `session` de Hono en localhost).
- Hono local: `ENV=local` + `DATABASE_URL` (Neon HTTP) + `AUTH_SECRET`; para
  probar el redirect de Google alcanza con `GOOGLE_CLIENT_ID`/`SECRET`/
  `REDIRECT_URI` fake (no hay exchange real).

## Verificación local sin credenciales Google

1. Python panel: `SESSION_COOKIE_NAME=panel_session uv run uvicorn app.main:app`
   (:8000) + panel Next (:3001); login email/password del admin.
2. Hono (:8787) con `.dev.vars` de Fase 2/3 + Google fake.
3. Playwright app: `/login` muestra el botón Google **y** el formulario; login
   con `admin@pulse.example.com` o `panel-admin` + password → `/dashboard`.
   Probar `/catalog`, `/songs`, `/account`, like, crear playlist y reproducir
   (escrituras Hono). El logout de `/settings` limpia la cookie. Alternativa:
   inyectar `session=<token firmado con signSession>` con `document.cookie`.
4. `curl -i http://localhost:8787/auth/login -H 'Content-Type: application/json'
   -d '{"identifier":"admin@pulse.example.com","password":"..."}'` → 204 +
   `Set-Cookie: session=...`; password incorrecta → 400.
5. `curl -i http://localhost:8787/auth/google?returnTo=/dashboard` con Google
   fake → 302 a `accounts.google.com` con state/PKCE (sin exchange real).
6. Prueba del loop: setear `session=invalid` y navegar `/login`/`/dashboard` →
   queda en `/login`, sin parpadeo.
7. Panel: login con `panel_session`, `/panel/{artists,songs,playlists}`.
8. `pnpm typecheck && lint && test && build`.

El login Google real y el deploy quedan bloqueados por el client de Google
Cloud y el Hyperdrive ID/credenciales de Cloudflare. El login con password
funciona en local, pero en prod requiere **Workers Paid** (argon2 supera el CPU
de Free).

## Deploy

1. Aplicar migración 0010 en Neon `main`.
2. `wrangler secret put AUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REDIRECT_URI`
3. `pnpm --filter @pulse-stream/app-api deploy`
4. Verificar `https://api.luisrivas.site/health`.
5. Deploy de `apps/web` en Vercel (el build puede hacer fetch del catálogo: la
   API debe estar arriba).
6. Probar login Google, cookie compartida, logout, lecturas y escrituras.
7. Ejecutar el seed del admin en la DB de prod.

## Variables

| Servicio | Variables |
|---|---|
| Worker | `ENV=prod`, `APP_URL=https://app.luisrivas.site`, `COOKIE_DOMAIN=luisrivas.site`, `CORS_ORIGINS=https://app.luisrivas.site`, `R2_PUBLIC_BASE_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, Hyperdrive binding |
| Vercel | `NEXT_PUBLIC_API_URL=https://api.luisrivas.site`, `COOKIE_DOMAIN=luisrivas.site`, `ENV=prod` |
| Python local | `SESSION_COOKIE_NAME=panel_session`, `DATABASE_URL` main, `R2_*`, `AUTH_SECRET` (panel), `CORS_ORIGIN_REGEX` loopback |
| Panel local | `NEXT_PUBLIC_API_URL=http://localhost:8000`, `PANEL_SESSION_COOKIE=panel_session`, `DATABASE_ENV=prod` |

## Verificación

- `curl https://api.luisrivas.site/health`.
- Login Google en una ventana privada; cookie `session` con `Domain=.luisrivas.site`.
- `GET /users/me` desde `app.` (server-side y browser).
- Like, playlist, play, recientes, cuenta.
- Panel local: login, alta de artista/álbum, ZIP, presign de audio; la app ve el
  contenido nuevo en ≤60-120 s.
- Playwright: smoke E2E contra producción (login, home, catálogo, detalle,
  playlist, recientes, account).
- Workers Logs: sin 1102; CPU p99 < 8 ms.
- Hyperdrive: queries/día < 70k.

## Documentación

- `AGENTS.md` raíz: nueva arquitectura, dos frontends, Hono, presupuesto Free,
  invariantes, cookies, comandos.
- `apps/web/AGENTS.md`: app-only (sin panel, OAuth).
- `apps/panel/AGENTS.md`: panel local, Python, panel_session.
- `README.md`: comandos de los 4 procesos y deploy.
- `tasks.md`: ledger de la migración.
- `plan-implementacion.md`: reemplazar la sección de deploy “no serverless”.

## Rollback

- La DB es compartida: se puede volver a apuntar la app a Python solo si Python
  está deployado; en el estado final no lo está.
- El Worker conserva versiones: `wrangler rollback` a la versión anterior.
- Vercel: promover el deployment anterior.
- La migración 0010 es aditiva (nullable + tabla nueva); no rompe Python.

## Criterios de cierre

- [ ] App en producción con Google OAuth y Hono.
- [ ] Panel local operativo contra la DB/R2 de prod.
- [ ] Sin errores 1102 ni límites Free excedidos.
- [ ] Docs actualizadas y `tasks.md` al día.
