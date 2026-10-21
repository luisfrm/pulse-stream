# Fase 5 — Workers Paid (requerido para password auth en prod)

**Objetivo:** subir a Workers Paid ($5/mes) para habilitar el login con
email/usuario + contraseña en producción y tener margen de CPU/requests, sin
cambiar la arquitectura.

## Cuándo

- **Sí o sí para password auth en prod**: argon2id (64 MB, 3 pasadas) tarda
  ~2 s de CPU en JS puro; Free limita a 10 ms.
- Errores 1102 (CPU) o p99 > 8 ms por otras rutas.
- > 70k requests/día o > 70k queries/día de Hyperdrive.

## Qué cambia

| Tema | Free | Paid |
|---|---|---|
| CPU | 10 ms | 30 s default (hasta 5 min) |
| Requests | 100k/día | 10M/mes |
| Subrequests | 50 | 10k |
| Hyperdrive | 100k queries/día | ilimitadas |

## Password auth (ya implementado en código)

- `POST /auth/login` acepta `{identifier, password}` donde `identifier` es email
  o username (case-insensitive) y setea la misma cookie `session` que Google.
- Verifica el hash argon2id de `pwdlib` con `@noble/hashes` (JS puro). Se
  descartó `hash-wasm`: en Workers falla con
  `WebAssembly.compile(): Wasm code generation disallowed by embedder`.
- `users.hashed_password` ya es nullable; no hay migración. Los usuarios creados
  solo con Google tienen `NULL` y no pueden usar password.
- No hay registro con password: el alta nueva es Google; el password es para
  cuentas existentes (admin/seed/legacy).
- La UI de `/login` muestra Google **y** el formulario (no hay flag: el endpoint
  está siempre disponible; en prod Free fallará por CPU, por eso se sube a Paid).
- Rate limit Upstash en `/auth/*` y `/me/listens`: **pendiente**.
- El admin del panel y los usuarios de la app pueden compartir hashes; el login
  del panel sigue siendo local contra Python.

## Tests

- Hash/verify compatible con `pwdlib` (fixture de hash generado en Python):
  `test/auth-password.test.ts` (email, username, password incorrecta, usuario
  OAuth-only, inactivo, body inválido) — verde.
- Form: `apps/web/app/(public)/login/login-form.test.tsx`.
- Playwright local: login con email y con username + password; logout; panel
  separado con `panel_session`.
- Pendiente: rate limit y Playwright contra prod.

## Monitoreo post-upgrade

- CPU media/p99 y errores 1102 en Workers Logs (el login con password es el pico
  esperado: ~2 s de CPU por intento).
- Hyperdrive queries y latencia.
- Neon compute hours (plan Free: 191 h/mes).
- Costo: $5/mes base; requests/CPU extra según uso.

## Criterios de cierre

- [x] Password auth implementado y testeado en local (API + web + Playwright).
- [ ] Upgrade a Workers Paid aplicado y límites verificados.
- [ ] Rate limit Upstash en `/auth/*` y `/me/listens`.
- [ ] Playwright contra producción (Google real + password).
- [ ] Sin regresiones en OAuth ni en el panel.
