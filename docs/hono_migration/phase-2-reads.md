# Fase 2 — Lecturas de la app en Hono, con paridad y caché

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

## Verificación

```bash
pnpm --filter @pulse-stream/app-api test
pnpm --filter @pulse-stream/app-api typecheck
# smoke local
pnpm --filter @pulse-stream/app-api dev
pnpm --filter @pulse-stream/web dev
```

Playwright: home, dashboard, search, catálogo, detalle de canción/álbum/artista,
playlists, recientes. Comparar respuestas/UX contra la versión Python.

## Criterios de cierre

- [ ] Todos los endpoints de lectura de la app portados.
- [ ] Parity tests verdes para cada endpoint.
- [ ] p99 de CPU < 8 ms en smoke test; queries por request dentro del presupuesto.
- [ ] Caché pública funcionando; `/me/*` sin caché.
- [ ] La app funciona con Hono en local con `NEXT_PUBLIC_API_URL=http://localhost:8787`.
- [ ] `pnpm typecheck`/`test`/`build` verdes.
