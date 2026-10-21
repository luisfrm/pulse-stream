# Estado de la migración

Actualizado: 2026-10-21

## Fase 0 — Fundación

- [ ] Migración 0010 (`hashed_password` nullable + `oauth_accounts`)
- [ ] Modelo `OAuthAccount` + `UserManager.authenticate` guard
- [ ] `SESSION_COOKIE_NAME` configurable
- [ ] `upsert_admin` + `scripts/create_admin.py`
- [ ] Tests Python (nullable, login 400, constraints, admin seed)
- [ ] `apps/app-api` skeleton (Hono, config, env, errores)
- [ ] JWT/cookies + Google OAuth (state + PKCE + ID token)
- [ ] `GET /users/me`, `/auth/logout`, `/health`
- [ ] Tests Hono + typecheck
- [ ] Suite Python completa verde
- [ ] Commit de fase

## Fase 1 — Split del frontend

- [ ] `packages/ui`, `design`, `api-client`, `shared`
- [ ] `apps/panel` (rutas, shell, servicios, login)
- [ ] `apps/web` sin panel, sin link al panel
- [ ] Tailwind v4 compartido + `transpilePackages`
- [ ] Tests movidos/verdes
- [ ] `pnpm typecheck && lint && test && build`
- [ ] Playwright smoke (app + panel)
- [ ] Commit de fase

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
