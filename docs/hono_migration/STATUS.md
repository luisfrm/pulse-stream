# Estado de la migración

Actualizado: 2026-10-21

## Fase 0 — Fundación

- [x] Migración 0010 (`hashed_password` nullable + `oauth_accounts`) — aplicada en dev; test con upgrade/downgrade
- [x] Modelo `OAuthAccount` + `UserManager.authenticate` guard
- [x] `SESSION_COOKIE_NAME` configurable
- [x] `upsert_admin` + `scripts/create_admin.py`
- [x] Tests Python (nullable, login 400, constraints, admin seed) — 6 tests
- [x] `apps/app-api` skeleton (Hono, config, env, errores)
- [x] JWT/cookies + Google OAuth (state + PKCE + ID token)
- [x] `GET /users/me`, `/auth/logout`, `/health`
- [x] Tests Hono + typecheck — 6 archivos / 42 tests
- [x] Suite Python completa verde — 118 passed
- [x] Commit de fase

Pendiente externo (no bloquea local): Hyperdrive ID real, Google OAuth
client/secrets y deploy del Worker.

## Fase 1 — Split del frontend

- [x] `packages/ui`, `design`, `api-client`, `shared`
- [x] `apps/panel` (rutas, shell, servicios, login)
- [x] `apps/web` sin panel, sin link al panel
- [x] Tailwind v4 compartido + `transpilePackages`
- [x] Tests movidos/verdes
- [x] `pnpm typecheck && lint && test && build`
- [x] Playwright smoke (app + panel) — panel login → /panel/artists|songs|playlists; app login → /dashboard|/catalog|/songs|/playlists; `/panel` en web = 404; sin errores de consola salvo el 404 intencional
- [x] Commit de fase

## Fase 2 — Lecturas

- [ ] Fixtures dorados de Python
- [ ] Endpoints de lectura en Hono
- [ ] Parity tests
- [ ] Caché pública
- [ ] Smoke + presupuesto Free
- [ ] Commit de fase

## Fase 3 — Escrituras

- [ ] Favoritos
- [ ] Playlists de usuario
- [ ] Listens + contadores (CTE)
- [ ] Perfil + presign cover
- [ ] Tests de estado/DB
- [ ] Commit de fase

## Fase 4 — Cutover

- [ ] Migración en prod
- [ ] Deploy Worker + Vercel
- [ ] Google OAuth en prod
- [ ] Panel local con `panel_session`
- [ ] Playwright prod
- [ ] Docs (`AGENTS.md`, `README.md`, `tasks.md`, plan)
- [ ] Commit de fase

## Fase 5 — Paid

- [ ] Upgrade
- [ ] Password auth (opcional)
- [ ] Monitoreo
