# Fase 5 — Workers Paid (requerido para password auth en prod)

**Objetivo:** subir a Workers Paid ($5/mes) para habilitar el login con
email/usuario + contraseña en producción y tener margen de CPU/requests, sin
cambiar la arquitectura.

## Cuándo

- **Sí o sí para password auth en prod**: argon2id (64 MB, 3 pasadas) tarda
  ~2 s de CPU en JS puro; Free limita a 10 ms.
- Errores 1102 (CPU) o p99 > 8 ms por otras rutas.
- > 70k requests/día.

## Qué cambia

| Tema | Free | Paid |
|---|---|---|
| CPU | 10 ms | 30 s default (hasta 5 min) |
| Requests | 100k/día | 10M/mes |
| Subrequests | 50 | 10k |

## Password auth (ya implementado en código)

- `POST /auth/login` acepta `{identifier, password}` donde `identifier` es email
  o username (case-insensitive) y setea la cookie `session`.
- Verifica el hash argon2id de `pwdlib` con `@noble/hashes` (JS puro). Se
  descartó `hash-wasm`: en Workers falla con
  `WebAssembly.compile(): Wasm code generation disallowed by embedder`.
- **No hay OAuth ni registro público**: el seed del panel crea `panel_users`
  (admins), no cuentas de la app; las cuentas de la app son filas de `users` y
  el alta nueva llega con Better Auth en la fase siguiente.
- La UI de `/login` muestra solo el formulario de password.
- Rate limit en `/auth/*` y `/me/listens`: **pendiente**.
- El admin del panel y los usuarios de la app pueden compartir hashes; el login
  del panel sigue siendo local contra Python.

## Tests

- Hash/verify compatible con `pwdlib` (fixture de hash generado en Python):
  `test/auth-password.test.ts` (email, username, password incorrecta, usuario
  sin password, inactivo, body inválido) — verde.
- Form: `apps/web/app/(public)/login/login-form.test.tsx`.
- Playwright local: login con email y con username + password; logout; panel
  separado con `panel_session`.
- Pendiente: rate limit y Playwright contra prod.

## Monitoreo post-upgrade

- CPU media/p99 y errores 1102 en Workers Logs (el login con password es el pico
  esperado: ~2 s de CPU por intento).
- Neon: queries/latencia y compute hours (plan Free: 191 h/mes).
- Costo: $5/mes base; requests/CPU extra según uso.

## Criterios de cierre

- [x] Password auth implementado y testeado en local (API + web + Playwright).
- [ ] Upgrade a Workers Paid aplicado y límites verificados.
- [ ] Rate limit en `/auth/*` y `/me/listens`.
- [ ] Playwright contra producción (password).
- [ ] Sin regresiones en el panel.
