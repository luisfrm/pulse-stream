# Fase 5 — Workers Paid (opcional)

**Objetivo:** subir a Workers Paid ($5/mes) cuando el uso o el producto lo
justifiquen, sin cambiar la arquitectura.

## Cuándo

- Errores 1102 (CPU) frecuentes o p99 > 8 ms.
- > 70k requests/día o > 70k queries/día de Hyperdrive.
- Se quiere habilitar email/password (argon2) en la app o hay más tráfico.

## Qué cambia

| Tema | Free | Paid |
|---|---|---|
| CPU | 10 ms | 30 s default (hasta 5 min) |
| Requests | 100k/día | 10M/mes |
| Subrequests | 50 | 10k |
| Hyperdrive | 100k queries/día | ilimitadas |

## Password auth (opcional)

- `AUTH_PASSWORD_ENABLED=true` en el Worker.
- Endpoints `POST /auth/register` y `POST /auth/login` con argon2id WASM
  (`hash-wasm` o `@noble/hashes/argon2`), PHC string compatible con `pwdlib`.
- `users.hashed_password` ya es nullable; no hay migración.
- La UI de la app muestra tabs “Google | Email” solo si el flag está activo.
- Rate limit con Upstash en login/register.
- Si se habilita, el admin del panel y los usuarios de la app pueden compartir
  hashes; el login del panel sigue siendo local.

## Tests

- Hash/verify compatible con `pwdlib` (fixtures de hashes generados en Python).
- Login/registro, rate limit, errores 400/409.
- Playwright: login Google y email/password; logout.

## Monitoreo post-upgrade

- CPU media/p99 y errores 1102 en Workers Logs.
- Hyperdrive queries y latencia.
- Neon compute hours (plan Free: 191 h/mes).
- Costo: $5/mes base; requests/CPU extra según uso.

## Criterios de cierre

- [ ] Upgrade aplicado y límites verificados.
- [ ] Si se habilitó password: tests de compatibilidad de hash verdes.
- [ ] Sin regresiones en OAuth ni en el panel.
