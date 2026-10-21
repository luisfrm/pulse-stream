# Fase 0 — Fundación: DB, admin del panel y esqueleto Hono + Google OAuth

> **Actualización (Fase 4 final):** este documento describe el plan original.
> El OAuth de Google y Hyperdrive se eliminaron; la implementación actual usa
> solo password y Neon HTTP en local/prod. Ver `STATUS.md` y
> `phase-4-cutover.md`. `oauth_accounts` se dropea en la migración `0011`.

**Objetivo:** dejar la base de datos lista para usuarios OAuth, el panel con un
admin local separado y una API Hono mínima en Workers que pueda autenticar con
Google y responder `GET /users/me`.

**No incluye:** lecturas del catálogo, escrituras de usuario, frontend partido,
deploy real (requiere credenciales de Cloudflare/Google).

## Tests primero

### Python (`apps/api/tests`)

Archivo `test_oauth_accounts.py`:

1. `test_user_hashed_password_nullable_for_oauth`
   - Inserta un `User` con `hashed_password=None`, `is_verified=True`, `role=None`.
   - Commit + refresh y assert `None`.
2. `test_login_oauth_user_returns_400`
   - Crea el usuario OAuth anterior.
   - `POST /auth/login` con cualquier password → **400** (nunca 500).
3. `test_oauth_account_unique_provider_account`
   - Dos filas con el mismo `(provider, provider_account_id)` → `IntegrityError`.
4. `test_oauth_account_unique_user_provider`
   - Dos filas con el mismo `(user_id, provider)` → `IntegrityError`.
5. `test_upsert_admin_creates_and_updates`
   - `upsert_admin(session, email, password, username)` crea `role="admin"`,
     `is_verified`, `is_active` y un hash verificable.
   - Login por API con esa password → 204.
   - Segunda llamada con otra password actualiza el hash: la vieja falla (400),
     la nueva entra (204).
6. `test_session_cookie_name_configurable`
   - `Settings(_env_file=None, session_cookie_name="panel_session")` lo respeta.
   - `cookie_transport.cookie_name == settings.session_cookie_name` con el valor
     por defecto.

Archivo `test_auth.py` existente: la suite completa debe seguir verde.

### Hono (`apps/app-api`)

Con Vitest y `app.request()` (sin Workers runtime):

1. `GET /health` → 200 `{status:"ok"}`.
2. `GET /users/me` sin cookie → 401 `{detail}`.
3. `GET /users/me` con JWT válido + repo fake → 200 con el shape `UserRead`.
4. JWT: firma/verifica; falla con otro secreto, otra `aud` o expirado.
5. `GET /auth/google` → 302 a `accounts.google.com` con `state`,
   `code_challenge`, `redirect_uri` y cookie `oauth_state`.
6. Callback con state inválido → 400 y sin cookie de sesión.
7. Callback feliz (fetch y verificación de ID token inyectados) → crea/vincula
   usuario, setea cookie `session` y redirige a `APP_URL + returnTo`.
8. `returnTo` con `//evil.com` o URL absoluta → se ignora y redirige a `/dashboard`.
9. `POST /auth/logout` → 204 y cookie expirada.

## Implementación

### 1. Migración 0010 (a mano)

`apps/api/alembic/versions/0010_oauth_accounts_nullable_password.py`

- `users.hashed_password` → `nullable=True`.
- `oauth_accounts`:
  - `id UUID PK`
  - `user_id UUID FK users(id) ON DELETE CASCADE`, index
  - `provider VARCHAR(20) NOT NULL`
  - `provider_account_id VARCHAR(255) NOT NULL`
  - `email VARCHAR(320) NULL`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `UNIQUE(provider, provider_account_id)`
  - `UNIQUE(user_id, provider)`
- `downgrade()` revierte en orden inverso (y vuelve `hashed_password` a NOT NULL;
  documentar que falla si hay usuarios OAuth).
- Encadenar `down_revision = "0009"`.

### 2. Modelos y auth Python

- `app/features/users/models.py`
  - Override `hashed_password: Mapped[str | None]` nullable.
  - `OAuthAccount` + relación `User.oauth_accounts` (`cascade="all, delete-orphan"`).
- `app/features/auth/manager.py`
  - `authenticate()`: si el usuario no tiene hash, devolver `None` (con el hash
    dummy para mantener el timing) en vez de dejar que `verify_and_update` explote.
- `app/core/config.py`
  - `session_cookie_name: str = "session"`.
- `app/features/auth/backend.py`
  - `CookieTransport(cookie_name=settings.session_cookie_name, ...)`.
- `apps/api/.env.example`
  - Documentar `SESSION_COOKIE_NAME=panel_session` para el panel.
- `app/features/users/admin_seed.py`
  - `async def upsert_admin(session, email, password, username=None) -> User`
  - Normaliza email a lowercase, valida password ≥ 8, usa
    `pwdlib.PasswordHash.recommended()`, setea `role="admin"`, `is_active`,
    `is_verified`, y username si viene.
- `apps/api/scripts/create_admin.py`
  - CLI con `argparse` (`--email`, `--password`, `--username`), abre
    `async_session_factory` y llama `upsert_admin`.
- `apps/api/tests/conftest.py`: importar `OAuthAccount` (el import del módulo de
  users ya lo registra; verificar que `Base.metadata` lo incluya).

### 3. Esqueleto `apps/app-api`

Estructura:

```
apps/app-api/
├── package.json
├── tsconfig.json
├── wrangler.jsonc
├── vitest.config.ts
├── .dev.vars.example
├── README.md
└── src/
    ├── index.ts                 # wiring de producción
    ├── app.ts                   # createApp(deps) testeable
    ├── env.ts                   # tipos de env/bindings
    ├── config.ts                # parseo de env (APP_URL, CORS, cookies)
    ├── auth/
    │   ├── session.ts           # JWT HS256 (jose), aud "pulse-app"
    │   ├── cookies.ts           # session/oauth_state, atributos por entorno
    │   ├── google.ts            # URLs, state+PKCE, exchange, ID token
    │   └── guards.ts            # requireUser
    ├── features/users/
    │   ├── schema.ts            # Zod UserRead
    │   ├── repository.ts        # interfaz + implementación pg
    │   └── routes.ts
    ├── db/
    │   ├── schema.ts            # Drizzle users + oauth_accounts
    │   └── client.ts            # pg + Hyperdrive/DATABASE_URL
    └── lib/
        ├── errors.ts            # {detail}
        └── username.ts          # generador de username
```

Dependencias: `hono`, `@hono/zod-openapi`, `zod`, `jose`, `drizzle-orm`, `pg`.
Dev: `wrangler`, `vitest`, `typescript`, `@types/pg`, `@cloudflare/workers-types`.

Contrato:

- `GET /health` → `{status:"ok"}`.
- `GET /auth/google?returnTo=/dashboard` → 302 a Google; cookie `oauth_state`
  firmada (JWT `aud="pulse-oauth-state"`, 10 min) con `state`, `code_verifier`
  y `returnTo`.
- `GET /auth/google/callback?code&state`:
  - Verifica cookie/state (timing-safe), exchange en
    `https://oauth2.googleapis.com/token` con `code_verifier`.
  - Verifica el `id_token` con el JWKS de Google
    (`https://www.googleapis.com/oauth2/v3/certs`), `aud=GOOGLE_CLIENT_ID`,
    issuer de Google, `email_verified === true`.
  - Upsert: buscar por `(provider, sub)` → por email lowercase → crear usuario +
    `oauth_accounts`. Un usuario existente conserva `role`, `username` y
    `hashed_password`.
  - Setea cookie `session` (JWT HS256, `sub`, `aud="pulse-app"`, 7 días).
  - Redirige a `${APP_URL}${returnTo}` (solo paths que empiezan con `/` y no `//`).
- `POST /auth/logout` → 204, cookie expirada.
- `GET /users/me` → `UserRead` o 401.

Atributos de cookie:
`HttpOnly`, `Path=/`, `SameSite=Lax`, `Secure` si `ENV !== "local"`,
`Domain=COOKIE_DOMAIN` si está seteado.

`wrangler.jsonc`: `nodejs_compat`, `compatibility_date`, binding Hyperdrive
(placeholder `REPLACE_WITH_HYPERDRIVE_ID`), vars `ENV`, `APP_URL`,
`COOKIE_DOMAIN`, `CORS_ORIGINS`, `R2_PUBLIC_BASE_URL`; secrets
`AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`.

`db/client.ts`: si `env.HYPERDRIVE` existe usa su `connectionString`; si no,
`env.DATABASE_URL` (para `wrangler dev`/tests locales). `pg.Client` por request,
cerrado con `ctx.waitUntil(client.end())`.

## Verificación

```bash
# Python
cd apps/api
uv run pytest tests/test_oauth_accounts.py -q
uv run pytest -q

# Hono
pnpm install
pnpm --filter @pulse-stream/app-api typecheck
pnpm --filter @pulse-stream/app-api test

# Migración (solo contra TEST_DATABASE_URL o una branch, nunca prod sin permiso)
cd apps/api && uv run alembic upgrade head
```

## Criterios de cierre

- [ ] Migración 0010 escrita y aplicada en la branch de test.
- [ ] `hashed_password` nullable en modelo y DB de test.
- [ ] `oauth_accounts` con ambas unique constraints y cascade.
- [ ] Login de un usuario OAuth devuelve 400, no 500.
- [ ] `upsert_admin` crea y rota password; login del admin funciona.
- [ ] `SESSION_COOKIE_NAME` configurable y usado por `CookieTransport`.
- [ ] `apps/app-api` compila, tests verdes y `/health` responde.
- [ ] Flujo Google (state, PKCE, callback, cookie, returnTo seguro) testeado con
      fetch/verificador inyectados.
- [ ] Sin credenciales reales en el repo.

## Bloqueos / pendientes externos

- Crear el OAuth Client en Google Cloud Console y cargar
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` como secrets del Worker.
- Crear el Hyperdrive config en Cloudflare y reemplazar el placeholder.
- Aplicar la migración 0010 a Neon `main` (requiere aprobación explícita; los
  tests usan `TEST_DATABASE_URL`).
