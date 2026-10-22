<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# `apps/web` — app de música (password)

- **API**: Hono (`apps/app-api`). `NEXT_PUBLIC_API_URL` = `http://localhost:8787`
  en local y `https://api.luisrivas.site` en prod; cookie `session`.
- **Login**: `/login` muestra solo el formulario de email/usuario +
  contraseña (`POST /auth/login` de Hono). No hay OAuth ni registro público:
  el seed del panel crea `panel_users` (admins del panel), **no** cuentas de la
  app; las cuentas de la app son filas de `users` y el alta nueva llega con
  Better Auth (Fase 2). `/register` redirige a `/login` por compatibilidad.
  Password auth requiere Workers Paid en prod.
- **`/account`**: email read-only; solo se editan `username` y cover
  (`PATCH /users/me` de Hono acepta únicamente esos campos).
- **Logout**: `<form method="POST" action="/api/logout">`; el route handler
  same-origin borra la cookie `session` con `ENV`/`COOKIE_DOMAIN`/`COOKIE_SAMESITE`.
- **Tipos**: `@pulse-stream/app-api-types` (generado desde
  `apps/app-api/openapi.json` con `pnpm gen:types:app`). No declarar tipos a mano.
- El panel admin **no** vive acá: es `apps/panel` (local, Python).
