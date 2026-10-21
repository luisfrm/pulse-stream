# Fase 2 — Lecturas de la app en Hono, con paridad y caché

> **Actualización (Fase 4 final):** el driver local y el de producción se
> unificaron en Neon HTTP (`@neondatabase/serverless`); no se usa `pg` ni
> Hyperdrive. Ver `STATUS.md`.

**Objetivo:** portar a `apps/app-api` todos los endpoints de lectura que consume
`apps/web`, con respuestas idénticas a Python y presupuesto Free.

## Tests primero

1. **Fixtures dorados**: script que siembra la DB de test con UUIDs fijos y
   captura las respuestas de Python para:
   - `GET /songs` (sin filtros, `q`, `artist_id`, `album_id`, `playlist_id`,
     `collaborator_id`, paginación).
   - `GET /songs/{id}`, `GET /songs/popular?limit&days|month`.
   - `GET /albums`, `/albums/{id}`, `/artists`, `/artists/{id}`, `/genres`.
   - `GET /playlists/public`, `/playlists/{id}`, `/me/playlists`,
     `/me/playlists/page`.
   - `GET /me/favorites`, `/me/favorites/{ids,albums,playlists}`, `/me/library/ids`.
   - `GET /me/recently-played`.
   - `GET /users/me`.
2. **Parity tests** en Vitest: llamar Hono con la misma DB sembrada y comparar
   JSON normalizado (orden de claves irrelevante; fechas ISO; UUIDs fijos).
3. **Shape tests**: `Page<T>`, `SongRead` (artist, album, collaborators, URLs de
   R2), `UserRead`.
4. **Cache tests**: dos llamadas a un endpoint público → una sola query; los
   endpoints `/me/*` no se cachean.

## Endpoints y queries

| Endpoint | Query budget | Notas |
|---|---|---|
| `/songs` | 1-2 | join artist+album, `json_agg` colaboradores; sin `DISTINCT` sobre `songs.*` (JSON) |
| `/songs/{id}` | 1-2 | mismo shape |
| `/songs/popular` | 2 | ranking desde `listens` (7 días / mes calendario) + songs |
| `/albums`, `/albums/{id}` | 1-2 | album + artist + songs según contrato |
| `/artists` | 1 | |
| `/genres` | 0 | constante/valores de `schemas.py` |
| `/playlists/public` | 2 | system primero; owner email; cover URL |
| `/playlists/{id}` | 2 | songs por `position`; privada solo dueño |
| `/me/playlists` | 1-2 | `song_ids` por playlist (picker) |
| `/me/favorites` | 2-3 | orden por `created_at`; songs con album+artist |
| `/me/library/ids` | 3 | 3 sets en una respuesta |
| `/me/recently-played` | 2-3 | CTE distinct + counts; NO 7 queries |
| `/users/me` | 1 | |

## Implementación

- `db/schema.ts`: generar con `drizzle-kit pull` desde Neon (branch `dev`); no
  editar a mano. Definir relaciones/`json_agg` en `queries/*`.
- `features/*/queries.ts`: SQL con `pg`/Drizzle; una query por endpoint cuando
  sea posible.
- `features/*/routes.ts`: Zod OpenAPI, auth guard, paginación.
- Cache: middleware de Hono sobre GETs públicos (`songs`, `albums`, `artists`,
  `genres`, `playlists/public`, `playlists/{id}` públicas), `max-age=60`.
  Nunca cachear `/me/*`, `/auth/*`, `/users/me`.
- Regla: las respuestas cacheadas no pueden incluir datos por usuario.
- `R2_PUBLIC_BASE_URL` + `object_key`/`cover_key` → `stream_url`/`cover_url`.
- `apps/web/lib/services` apunta a `appApi` por feature flag
  (`NEXT_PUBLIC_API_URL` o `APP_API_MODE`), dominio por dominio.
- `packages/app-api-types`: generar desde `/openapi.json` y reemplazar los tipos
  de lectura de la app; el panel conserva los de Python.

## Paridad: trampas conocidas

- `GET /songs?collaborator_id=` excluye al artista principal.
- No usar `DISTINCT` sobre `songs.*` (columna JSON → error en Postgres).
- `playlists` system van primero en el feed público.
- `GET /me/favorites` debe eager-load `Song.album` (el bug histórico de
  `MissingGreenlet` se traduce a un join obligatorio).
- `SongRead.album` puede ser `null` en canciones legacy.
- `domain` de `genres` en minúscula; `formatGenre` sigue en el front.
- `MyPlaylistRead.song_ids` en orden de `position`.

## Contrato verificado contra Python (dev DB, 2026-10-21)

- `Page<T> = {items,total,offset,limit}`.
- `ArtistRead`: `id,name,image_url,cover_key,created_at,cover_url`.
- `AlbumRead`: `id,title,artist,cover_key,cover_url,song_count,created_at`.
- `SongRead`: `id,title,artist,album,genres,lyrics,object_key,duration_seconds,play_count,created_at,stream_url,cover_url,collaborators`.
  - En listas, detalle de song, favoritos, recientes y playlist detail, `song.album.song_count` es **0** (comportamiento de Python; no "corregir").
  - En `GET /albums/{id}`, `song.album.song_count` es el total del álbum.
- `PlaylistRead`: `id,kind,name,description,is_public,cover_key,cover_url,song_count,query,owner_email,created_at`.
- `PlaylistDetail`: PlaylistRead + `songs` (orden position; nested album song_count 0).
- `MyPlaylistRead`: PlaylistRead + `song_ids` (orden position), sin `songs`.
- `RecentlyPlayedSong`: SongRead + `user_play_count`.
- `SongWithPlays`: SongRead con `play_count` = count de la ventana (no el contador persistente).
- URLs: `stream_url = R2_PUBLIC_BASE_URL + "/" + object_key`; cover de song = cover del álbum; el resto = su `cover_key`; null si falta key/base.
- Fechas ISO-8601 con `Z`; UUIDs string.

Datos de paridad sembrados en dev:

| Dato | Valor |
|---|---|
| Usuario | `parity@pulse.example.com` / `Parity-Pass-2026!` — id `ad26a7b7-2d81-44ad-b905-d97a1e174ba8` |
| Playlist pública | `0336f34f-05f1-4a4d-a0f8-374c9905da67` ("Parity Mix", 2 songs, posiciones 0/1) |
| Favoritos | song `94813f9e-fcd3-41b2-b92a-bf3daa6048fa`, album `20bfa259-2923-4835-bbba-8be7a3cf9598`, playlist de arriba |
| Escuchas | 2 plays (song1 + song2) del usuario parity |

Smoke de paridad sugerido (después de implementar): levantar Python `:8000` y Hono
`:8787` contra la misma DB, firmar una sesión Hono para el usuario parity y
comparar JSON normalizado de cada endpoint (público y `/me/*`).

## Verificación

### Driver de DB (decisión final)

La implementación final usa **Neon HTTP** (`@neondatabase/serverless`) en local
y en producción:

- `DATABASE_URL` → `NeonHttpDatabase`, misma SQL parametrizada, sin TCP.
- No hay `RequestDatabase`, `pg` ni Hyperdrive.
- Un solo `Queryable` por request compartido entre `users` y `catalog`.

El hallazgo histórico fue que `pg` sobre TCP se colgaba en `wrangler dev` contra
Neon; unificar todo en HTTP evita esa diferencia local/prod.

### Orden estable con timestamps iguales

El import ZIP crea todas las canciones en una transacción → mismo
`created_at`. Para que la paginación sea determinista y la paridad posible:

- `/songs` (y favoritos): `created_at DESC, title ASC, id ASC`.
- `GET /albums/{id}` (`Album.songs`): `title ASC, id ASC` (los filenames del ZIP
  ya venían ordenados por nombre, así que el orden es el esperado).
- Python (`songs/repository.py`, `albums/models.py`) y Hono usan la misma regla.

### Paridad en vivo (2026-10-21)

Python `:8000` + Hono `:8787` (Neon HTTP) contra la misma DB de desarrollo, con
el usuario parity y una sesión Hono firmada. **25/25 endpoints OK**, comparando
JSON normalizado (fechas, claves, orden de items):

- Públicos: songs (+ filtros playlist/q), popular (days/month), detalle,
  albums, album detail, artists, genres, playlists/public.
- Auth: `/playlists?mine=true`, playlist detail, favoritos (songs/albums/
  playlists + ids), library ids, `/me/playlists`, `/me/playlists/page`,
  `/me/recently-played`, `/users/me`.
- Diferencias esperadas y documentadas: `400 {detail}` en validación (FastAPI
  devuelve 422), `mine=false` sin el tope accidental de 100 de Python, y
  `MyPlaylistRead` sin el corte de 50 (devuelve todas).

### Comandos

```bash
pnpm --filter @pulse-stream/app-api typecheck
pnpm --filter @pulse-stream/app-api test
pnpm --filter @pulse-stream/app-api gen:openapi
# smoke local: wrangler dev con .dev.vars (ENV=local, DATABASE_URL, AUTH_SECRET,
# R2_PUBLIC_BASE_URL) + uvicorn :8000, misma DB
```

## Criterios de cierre

- [ ] Todos los endpoints de lectura de la app portados.
- [ ] Parity tests verdes para cada endpoint.
- [ ] p99 de CPU < 8 ms en smoke test; queries por request dentro del presupuesto.
- [ ] Caché pública funcionando; `/me/*` sin caché.
- [ ] La app funciona con Hono en local con `NEXT_PUBLIC_API_URL=http://localhost:8787`.
- [ ] `pnpm typecheck`/`test`/`build` verdes.
