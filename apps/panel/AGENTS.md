<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# `apps/panel` — backoffice admin local

- **API**: FastAPI (`apps/api`, `http://localhost:8000`). El panel **no se
  despliega**: corre local contra la DB/R2 de producción (acceso remoto opcional
  con `cloudflared` + Cloudflare Access).
- **Cookie**: `PANEL_SESSION_COOKIE=panel_session` (default). El Python local
  debe correr con `SESSION_COOKIE_NAME=panel_session`; así no comparte la cookie
  `session` que emite Hono para `apps/web` en localhost.
- **Login**: email/password propio (`app/login`) contra Python. Sin register.
- **Guards**: `proxy.ts` chequea solo la presencia de `panel_session`; el layout
  valida sesión + `role=admin`/`is_superuser` con `GET /users/me`.
- **Tipos**: `@pulse-stream/api-types` (generado desde el OpenAPI de Python con
  `pnpm gen:types`). No declarar tipos a mano.
- Todo el CRUD admin vive acá: artists/albums/songs, ZIP, playlists system,
  uploads (audio + cover) y usuarios admin.
