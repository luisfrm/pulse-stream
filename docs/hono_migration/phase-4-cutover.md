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

- Login: reemplazar formulario email/password por “Continuar con Google”.
- `/register`: redirige a login (la cuenta se crea en el primer login Google).
- `/account`: email read-only, sin password; solo username + cover.
- `authService`: eliminar `login`/`register`; el logout sigue siendo el route
  handler same-origin `/api/logout`.
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
