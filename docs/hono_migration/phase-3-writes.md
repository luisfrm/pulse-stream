# Fase 3 — Escrituras de usuario en Hono

**Objetivo:** mover a Hono todo lo que la app escribe: favoritos, playlists de
usuario, listens/contadores, perfil (username/cover) y presign de covers.

## Tests primero

### Contrato y estado

- Favoritos: `PUT`/`DELETE` de songs/albums/playlists; `GET /me/favorites/ids` y
  `/me/library/ids` reflejan el cambio; idempotencia (PUT repetido no duplica).
- Playlists: crear, editar, borrar; agregar canción (posición = max+1, única);
  quitar canción y renumerar posiciones 0..n-1; privada vs pública; dueño vs
  ajeno (403); system no mutable por el usuario.
- Listens: `POST /me/listens` inserta + incrementa `songs.play_count` y
  `users.total_plays`; dos plays del mismo song en <30 s → una fila, contadores
  una vez; >30 s → nueva fila.
- Perfil: `PATCH /users/me` con `username` (único case-insensitive, regex) y
  `cover_key` (`covers/{uuid}.webp`); no acepta `role`, `email` ni `password`.
- Presign cover: valida `image/webp` ≤256 KB, devuelve `covers/{uuid}.webp` y
  firma `Cache-Control` inmutable.

### SQL

- Tests que comparan el estado de la DB contra el comportamiento de Python
  (mismos rows/contadores/posiciones).
- Test de concurrencia básico: dos `POST /me/listens` simultáneos no duplican
  contadores (o documentar la garantía del CTE).

## Implementación

- `POST /me/listens`: **una sentencia** con CTEs:
  - CTE `last` (último listen del user).
  - CTE `ins` (insertar si no es el mismo song dentro de 30 s).
  - `UPDATE songs SET play_count = play_count + (SELECT count(*) FROM ins)`.
  - `UPDATE users SET total_plays = total_plays + (SELECT count(*) FROM ins)`.
  - Devolver el listen insertado o el último (dedupe) con el shape `ListenRead`.
- Favoritos: `INSERT ... ON CONFLICT DO NOTHING` / `DELETE`; una query.
- Playlists:
  - Crear: insert con `crypto.randomUUID()`, `kind='user'`, `owner_id`.
  - Agregar: `INSERT INTO playlist_songs (position) SELECT COALESCE(MAX(position)+1,0) ...`
    en una query; `ON CONFLICT` → mismo comportamiento que Python (definir 409/no-op).
  - Quitar: transacción (Hyperdrive la soporta) delete + renumber; o CTE si es
    posible. Setear `playlists.updated_at = now()`.
- `PATCH /users/me`: update con `updated_at = now()`; validar username único
  case-insensitive y `cover_key`; no aceptar campos de auth.
- `POST /uploads/presign-cover`: `aws4fetch` con las mismas credenciales y
  `Cache-Control: public, max-age=31536000, immutable`.
- `POST /auth/logout`: limpiar cookie (la web ya lo hace same-origin; el endpoint
  queda para clientes directos).
- Rate limit: Upstash en `/auth/*` y `/me/listens` (10k comandos/día free).

## Invariantes

- `updated_at = now()` en cada UPDATE (SQLAlchemy `onupdate` era del ORM).
- UUIDs generados con `crypto.randomUUID()` (los defaults de Python no existen
  en la DB).
- `role` nunca se acepta en el perfil; solo el panel lo cambia.
- Los contadores son incrementos atómicos; nunca `SELECT` + `UPDATE` en dos pasos.
- El dedupe de 30 s usa el último listen del user, no el último global.

## Verificación

```bash
pnpm --filter @pulse-stream/app-api test
pnpm --filter @pulse-stream/app-api typecheck
pnpm --filter @pulse-stream/web test
```

Playwright: like/unlike, crear playlist + agregar/quitar canción, reproducir y
verificar "recientes" + contador, cambiar username/cover en `/account`.

## Criterios de cierre

- [ ] Todas las escrituras de la app portadas y testeadas.
- [ ] Estado de DB idéntico a Python en los mismos escenarios.
- [ ] Sin 500 por constraints; conflictos devuelven 400/409 con `{detail}`.
- [ ] La app funciona end-to-end contra Hono.
- [ ] `updated_at`, UUIDs y contadores correctos.
