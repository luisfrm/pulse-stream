# Tasks — Ledger de tareas del proyecto

> Registro vivo de tareas nuevas detectadas durante el desarrollo (y su
> resolución). Cuando aparece una idea de mejora, se agrega acá y se resuelve
> en la misma pasada o en la siguiente.

## ✅ Rewrite del backend en Cloudflare Workers (`apps/api-worker`) — F0..F8

Port completo del backend Python a Hono/Drizzle sobre Workers, con paridad de
contrato verificada por CI. `apps/api` queda como implementación de referencia.

| Fase | Alcance | Estado |
|---|---|---|
| **F0** | Esqueleto del Worker: Hono + `/health`, CORS con credenciales, error handler con el body de FastAPI, `/openapi.json` + `/docs` (solo local), `wrangler.jsonc`, `env.ts` normalizado | ✅ |
| **F1** | Drizzle + Neon HTTP: esquema espejo de Alembic (0001..0009) + migraciones propias (`0001_better_auth`), `db:check`/`db:generate`/`db:migrate` con guard, `user:set-password` | ✅ |
| **F2** | better-auth (email+password, cookie HttpOnly `session`), CSRF por `Origin`, rate limiting en `rate_limits` | ✅ |
| **F3** | Usuarios: `/auth/*` (login/logout/register/forgot/reset/verify), `/users/me`, `/users/{id}` (superusuario), `/admin/users` (listado/borrado/rol) | ✅ |
| **F4** | Catálogo: artistas, álbumes (+ detalle), canciones (+ colaboradores N:M, álbum obligatorio), géneros, `songs/popular`; serializadores Pydantic idénticos | ✅ |
| **F5** | Uploads: presign de audio/covers (aws4fetch, WebP ≤ 256 KB con `Cache-Control` firmado), import por ZIP de un álbum (40 MB, ZIP bomb/CRC/audio propios, storage inyectable) | ✅ |
| **F6** | Playlists de usuario + `system` (snapshots top_week/top_month/new, refresh) y biblioteca (`/me/favorites` de canciones/playlists/álbumes + `/me/library/ids`) | ✅ |
| **F7** | Historial: `POST /me/listens` (dedupe 30 s + contadores atómicos en un batch) y `GET /me/recently-played` (`user_play_count`) | ✅ |
| **F8** | Cierre: puerto 8787, `gen:types:worker` (mismo `generated.ts` que Python salvo 2 desviaciones documentadas), gate de contrato con paths/status/`$ref`, CI con `TEST_DATABASE_URL` + guard, `build` dry-run, docs | ✅ |

Pendientes conocidos del rewrite: `UserCreate`/`UserUpdate` no aceptan campos
de privilegio (desviación de seguridad deliberada) y `PlaylistRead.kind` sale
como enum inline en vez de `$ref` (zod no puede emitir `$ref` + `default`); ambos
están documentados en el gate de contrato.

## ✅ Resueltas (Fase 3b — vida de usuario + reproductor + PWA)

| # | Tarea | Resolución |
|---|---|---|
| 11 | **Historial de reproducciones (listens)** | Tabla `listens` (user + song + played_at, dedupe de plays consecutivos de 30 s). `POST /me/listens` + `GET /me/recently-played` (distintas, último play primero). Migración 0005 + 8 tests |
| 12 | **Ranking popular** | `GET /songs/popular` con `play_count` (ventana configurable en días). Alimenta la sección "Populares ahora" del dashboard |
| 13 | **Playlists de la comunidad con autor** | `GET /playlists/public` (público, paginado) + `owner_email` en `PlaylistRead` (propiedad del modelo, nunca el objeto owner) |
| 14 | **Home público promocional** | Rediseño Hallmark (género atmospheric, macrostructure Marquee Hero, nav N5 píldora flotante, footer Ft5 Statement). Con sesión redirige a `/dashboard`; sin sesión invita a registrar/loguearse/escuchar el catálogo |
| 15 | **Sidebar en el área protegida** | `DashboardShell` reemplaza el top-nav: sidebar desktop + drawer móvil (hamburguesa), grupos de navegación (Inicio/Buscar/Tu biblioteca/Administración), chip de usuario + logout |
| 16 | **Dashboard tipo board (Spotify)** | Greeting por hora + secciones: Seguí escuchando (recientes), Recién agregadas, Populares ahora, Playlists de la comunidad. Tarjetas `SongCard`/`PlaylistCard` con play inline |
| 17 | **Buscador en el dashboard** | `/dashboard/search` con estado en URL (debounce) + resultados de canciones (grid) y artistas (paginados) |
| 18 | **Reproductor propio mejorado** | Barra inferior con entrada animada (slide-up) y línea de progreso; al tocarla abre **fullscreen** (cover con fondo desenfocado, controles grandes, seek, tabs Ahora/Letra, descarga offline). `player-sheet.tsx` fue reemplazado por `player-fullscreen.tsx` |
| 19 | **Registro automático de plays** | El `PlayerProvider` llama `POST /me/listens` cuando una canción realmente empieza a sonar (solo con sesión; fire-and-forget) |
| 20 | **PWA + descarga offline** | Service worker manual (`public/sw.js`): shell offline para navegación, stale-while-revalidate para estáticos, cache-first para audio descargado. Botón "Descargar" en el reproductor guarda el audio completo en la Cache API (`lib/offline.ts`) y lo reproduce sin stream |
| 21 | **Tests frontend (Vitest)** | Setup Vitest + jsdom + RTL (`vitest.config.ts`), 16 tests unitarios de `lib/offline` (Cache API mockeada) y `lib/utils/format` |

## ✅ Resueltas (Fase 4 — perfil, plays, álbumes y colaboraciones)

| # | Tarea | Resolución |
|---|---|---|
| 22 | **Username + confirmar contraseña en el registro** | `users.username` (único, case-insensitive, nullable) + cover del perfil. `UserCreate`/`UserUpdate` con username validado; unicidad chequeada en el `UserManager` (create + update). Form de registro con campo username y confirmación de contraseña. Migración 0006 |
| 23 | **Página /account** | Ruta protegida con form de username/email/contraseña + foto de portada (JPG/WebP ≤ 512 KB vía `presign-cover` + `CoverUploader`) + contador de reproducciones del usuario. Nav pública: botón "Mi cuenta" con ícono User → `/account`, username en vez de email, sin link a Panel, nombre sin cortarse |
| 24 | **Contadores de plays** | Cada play suma +1 a `songs.play_count` (contador persistente) y +1 a `users.total_plays` (lo escuchado por el usuario). Incrementos atómicos (race-safe) en `record_play`, respetando el dedupe de 30 s. La página de canción muestra las reproducciones |
| 25 | **Dashboard con rankings** | Se reemplazó "Populares ahora" por **Más escuchadas esta semana** (`/songs/popular?days=7`) y **Más escuchadas este mes** (`month=true` = mes calendario). Se eliminó la llamada duplicada a recientes (una sola fetch con `{items, total}`) |
| 26 | **Recientes con plays por usuario** | `GET /me/recently-played` devuelve `user_play_count` por canción (un solo query agrupado); la página muestra el badge "N×" y el total de plays de la página |
| 27 | **Playlists del sistema** | `playlists.kind` ('user'|'system'); `POST /playlists/system` (admin) genera snapshots de queries (`top_week`/`top_month`/`new`). En el feed público van primero; solo un admin las muta. Panel: página `/panel/playlists` con generador + borrado |
| 28 | **Álbumes** | Feature nueva `albums` (title + artist_id + cover). `songs.album_id` (ON DELETE SET NULL). CRUD admin en `/panel/albums` (con cover), página pública `/album/[id]` y sección Álbumes en el artista. `AlbumRead` con `song_count` en un query agrupado (sin N+1) |
| 29 | **Colaboradores en canciones** | Tabla `song_collaborators` (N:M canción ↔ artista). `SongRead.collaborators`, filtro `GET /songs?collaborator_id=X` (excluye al artista principal). Sección **Colaboraciones** en la página de artista; forms de canción (crear/editar) con álbum + colaboradores. Migración 0007 |
| 30 | **Tests Fase 4** | 78 tests de integración verdes (albums, plays, username, playlists system) + 19 unitarios de frontend; typecheck y lint limpios |

## ✅ Resueltas (optimización de navegación / page transitions)

| # | Tarea | Resolución |
|---|---|---|
| 32 | **Optimización de navegación (page transitions)** | Layouts de áreas protegidas **no-async** con `<Suspense fallback={<FullScreenLoader/>}>` (full-screen solo en la entrada al área, no en cada navegación); nav público con `PillSkeleton`; `getSession` con `React.cache()` (dedupe de `GET /users/me` por request, `sessionService.getSession` queda como wrapper); primitiva `Skeleton` (`components/ui/skeleton.tsx`) + composiciones (`components/loading-skeletons.tsx`); `loading.tsx` por ruta; dashboard con Suspense por sección (streaming) y `search` con Suspense solo en resultados; `Promise.all` para sesión + datos; `PlayerFullscreen` lazy (`next/dynamic`, `ssr: false`); `error.tsx` branded por área; `.animate-pulse` en `prefers-reduced-motion` y `Button` con `Loader2` + `aria-busy`. Verificado: typecheck, lint, 22 tests y build OK |

## ✅ Resueltas (Fase 4.5 — fixes e integraciones puntuales)

| # | Tarea | Resolución |
|---|---|---|
| 50 | **Subir .aac falla con `audio/vnd.dlna.adts`** | Los navegadores/OS reportan los `.aac` como ADTS/DLNA. Se agregó `audio/vnd.dlna.adts` a `ALLOWED_CONTENT_TYPES` + `AUDIO_EXTENSIONS` (→ `.aac`) en `uploads/service.py`, test `test_presign_aac_dlna` y `accept` del FileInput del panel |
| 51 | **Vercel Analytics** | `@vercel/analytics` instalado y `<Analytics/>` montado en el root layout (`app/layout.tsx`) |

> Nota: el commit `b0b1262` (R2 presigned uploads) incluyó además el fix AAC y el analytics.

## ✅ Resueltas (Fase 5 — Mi catálogo, biblioteca y settings)

> Contrato de IA cumplido: "Mi catálogo" → `/dashboard/catalogo` · "Canciones" →
> `/dashboard/canciones` · `/dashboard/favorites` → redirect · Settings →
> `/dashboard/configuracion` (todos) · Bottom nav (Catálogo + Cuenta→`/account` +
> top bar móvil con hamburguesa) · Backend: favoritos de álbumes/playlists +
> `GET /me/library/ids` · **Descarga = `OfflineButton` (Cache API), NO endpoint
> nuevo** (se revirtió el `download_url`/`presign_get_download`/`_download_filename`
> que un agente había agregado por error).

| # | Tarea | Resolución |
|---|---|---|
| 33 | **Favoritos de álbumes y playlists + library ids** (backend) | Migración `0008` (tablas `user_favorite_albums`/`user_favorite_playlists` + columna `playlists.query`). Endpoints `GET/PUT/DELETE /me/favorites/albums[/{id}]`, `/playlists[/{id}]` (+ `/ids`) y `GET /me/library/ids` (los 3 sets). Conftest importa los modelos nuevos. **91 tests verdes** |
| 34 | **Algoritmo de playlists** (backend) | `_snapshot_song_ids` centralizado (top_week = últimos 7 días, top_month = mes calendario, new = created_at desc; unicidad por group by). `query` persistida por playlist system + `POST /playlists/system/{id}/refresh` (regenera sin duplicar; guard de query inválida → 400) + test de `top_month` |
| 35 | **Regenerar tipos** | `pnpm gen:types` → `generated.ts` con `/me/library/ids`, favoritos albums/playlists y `GET /me/playlists` (`PlaylistRead.query` + enum `PlaylistSystemQuery`). Typecheck web OK |
| 36 | **Servicios de biblioteca** (frontend A) | `favorites-service.ts`: `getFavoriteAlbums/Playlists`, `add/remove`, `getLibraryIds()` (1 sola llamada para los 3 sets). `library.ts`: `UserLibrary` gana `albumIds`/`playlistIds`. Se eliminó `getFavoriteIds` (dead code) |
| 37 | **PlaylistPicker (dropdown "+")** (frontend A) | Popover propio en desktop + BottomSheet en mobile (mismo contenido), lista con `song_count`, "Nueva playlist" (crear+agregar), loading/error/toast. z-index subido a `z-50` (no lo tapa la player bar). 3 tests vitest |
| 38 | **SongItem: descargar + like + "+"** (frontend A) | `song-actions.tsx` usa `PlaylistPicker` + `OfflineButton compact` (icono, Cache API). `favorite-button.tsx` extraído (toggle optimista con rollback) |
| 39 | **SongCard: botón "+"** (frontend A) | Props opcionales `playlists`/`favoriteIds`/`onMutated`; corner con corazón+"+" solo con sesión (sin props = idéntico, home público intacto). 2 tests vitest |
| 40 | **Página `/dashboard/catalogo`** (frontend A) | 3 secciones: Canciones (lista con `SongItem` paginada), Playlists (propias + system likeadas + "Nueva playlist" + "Ver todas"), Álbumes (likeados, `album-card.tsx` nuevo). `force-dynamic` + `Promise.all` + `updateTag`; búsqueda con `q` (ventana 200) |
| 41 | **Página `/dashboard/canciones`** (frontend A) | Explorar canciones: grid de `SongCard` con acciones + SearchInput + paginación, catálogo cacheado por tags (`revalidate: 60`) |
| 42 | **Redirect favorites** (frontend A) | `/dashboard/favorites` → `redirect("/dashboard/catalogo")` (content live en catalogo) |
| 43 | **Playlist detail UI** (frontend A) | Hero con cover + backdrop gradiente, play-all (cola = canciones), like de system, editar/borrar por ownership real (`owner_email`), badges de visibilidad. `playlist-play-button.tsx`/`playlist-like-button.tsx`/`playlist-edit-form.tsx` |
| 44 | **Sidebar: grupos, orden y chip** (frontend B) | "Mi catálogo" primero (Principal) · Biblioteca (Canciones/Playlists/Recientes) · Administración (Configuración para todos + Panel admin) · chip de usuario eliminado (logout → Configuración) · top bar móvil con hamburguesa que abre el drawer. `pb-24` conserva aire para la player bar |
| 45 | **Bottom nav** (frontend B) | Catálogo → `/dashboard/catalogo`; Cuenta → Link a `/account` (se fue `onOpenMenu`). 4 tests de hrefs |
| 46 | **Página `/dashboard/configuracion`** (frontend B) | Lista de opciones: Cuenta (→`/account`), Cache (peso con `storage.estimate` + `getOfflineCacheSize` + eliminar) y Cerrar sesión (`LogoutButton`) |
| 47 | **Cache: clearOfflineCache + tests** (frontend B) | `lib/offline.ts`: `clearOfflineCache()` (solo `pulse-offline-v1`, no toca `pulse-shell-v1`) + `getOfflineCacheSize()`. 4 tests nuevos |
| 48 | **Tests frontend Fase 5** (A + B) | **35 tests / 6 files** verdes (playlist-picker, song-card, bottom-nav, offline, cover-uploader, format) + typecheck + lint + build OK |

**Fixes del reviewer (coordinación post-implementación):**
- `song_count` en `GET /me/favorites/albums` (LEFT JOIN agrupado en `favorites/repository.py::list_albums`, GROUP BY `albums.id, created_at`) + assert en el test → detectó y arregló un `GroupingError` de Postgres.
- `Song.album` sin eager-load en `playlists/repository.py::_with_songs` → `MissingGreenlet` en cualquier playlist con canciones de álbum (validación de `SongRead.album`). Agregado `selectinload(Song.album)`.
- Dropdown del picker `z-30` → `z-50` (lo tapaba la player bar `z-40`).
- Guard 400 si `playlists.query` tiene valor inválido (antes 500).
- Shortcut del PWA manifest `Tus favoritos` → `Mi catálogo`.

| # | Tarea | Estado |
|---|---|---|
| 49 | **Verificación final Fase 5** | `uv run pytest` = **91 passed** · `pnpm gen:types` OK · web typecheck/lint/**35 tests**/build OK. **Pendiente**: recorrido manual + actualizar `README.md` + commitear + pushear |

## ✅ Fase 5.5 — Correcciones del catálogo y la biblioteca (Resuelta)

> Requerimientos del usuario (19/08/2026) en `plan-implementacion.md` §14.
> Orden de ejecución: **backend** (pertenencia canción↔playlist + tests) →
> `pnpm gen:types` → **frontend** (picker "Ya está", cards compactas, catálogo
> 10+Ver todas+infinite scroll, rutas en inglés + buscador) → verificación.
> **Nota de desvío**: §14.2 se resolvió con la **opción A** (`song_ids` por
> playlist en `GET /me/playlists` → `MyPlaylistRead`), no con el endpoint
> `containing?song_id=` que sugiere la tarea 52 — el frontend no hace fetch lazy
> extra (los `song_ids` ya vienen en la lista). El duplicado sigue idempotente.

| # | Tarea | Estado |
|---|---|---|
| 52 | **Backend: pertenencia canción↔playlist + duplicado idempotente** (§14.2) | Resuelto — opción A: `song_ids` por playlist en `GET /me/playlists` (`MyPlaylistRead`); duplicado idempotente + tests (`test_playlists_me.py`) |
| 53 | **Backend: tests "canción sin álbum" + auditoría frontend** (§14.1) | Resuelto — canciones sin álbum OK (`album: null`); frontend ya guarda con `?.`. NOTA Fase 7: la API hoy exige `album_id` (crear sin él = `422` Pydantic, quitarlo = `400`), así que el caso "sin álbum" solo se da con dato legacy o fixture directa en DB — no se puede crear por API |
| 54 | **Regenerar tipos** (`pnpm gen:types`) | Resuelto — `MyPlaylistRead` + `song_ids` en `generated.ts` |
| 55 | **Frontend: PlaylistPicker "Ya está en esta playlist"** (§14.2) | Resuelto — fila deshabilitada + check (2 tests vitest) |
| 56 | **Frontend: PlaylistCard compacta en el catálogo** (§14.3) | Resuelto — prop `compact` (cover `h-14 w-14`) |
| 57 | **Frontend: catálogo — 10 recientes + "Ver todas"** (§14.4) | Resuelto — `limit: 10` + botón → `/catalog/songs` |
| 58 | **Frontend: página `/catalog/songs` con infinite scroll** (§14.4) | Resuelto — `songs-list.tsx` con IntersectionObserver, 20/página |
| 59 | **Frontend: rutas en inglés top-level + redirects + nav** (§14.5) | Resuelto — `/catalog`, `/songs`, `/settings`, `/search`, `/playlists`, `/recently-played` top-level; redirects viejos; nav/proxy/manifest/AGENTS.md actualizados |
| 60 | **Frontend: arreglar buscador de `/songs`** (§14.5) | Resuelto — causa raíz: services mandaban `query` pero la API espera `q` (afectaba `/songs` y `/search`) |
| 61 | **Verificación final Fase 5.5 + docs** | Resuelto — **95 passed** backend · web typecheck/lint/37 tests/build OK · fix de aislamiento de tests (nombres únicos) |

## ✅ Fase 6 — Performance home (Lighthouse, resuelta parcial · thumbnails → Fase 2)

> Auditoría `http://localhost:3000/` (mobile): dev perf 0.75 → prod (`next build` +
> `next start`) perf **0.93** / a11y **0.96**. El JS sin usar de dev era artefacto
> de Turbopack/devtools (sin acción). Implementado en esta pasada:
> - Home sin `priority` en songs/artists/playlists (LCP = H1 texto, todo bajo el
>   fold 88dvh) → covers eager t=33ms → lazy t=125ms (`app/(public)/page.tsx`).
> - `SongCard`: `PlaylistPicker`/`FavoriteButton` a `next/dynamic` (chunk separado;
>   home anónimo no los descarga) + test async (`findByRole`).
> - `SongCard`: links título/artista con `min-h-6` (WCAG 2.2 AA 24px).
> Re-auditoría prod: perf **0.92** / a11y **1.0** (target-size OK; TBT 40→30ms).
> LCP 3.2→3.3s dentro de varianza (render-delay texto ~320ms, limitado por CPU
> throttled; resto = covers 125–168 KiB → Fase 2).

| # | Tarea | Estado |
|---|---|---|
| 62 | **Fase 2: thumbnails de covers** (353 KiB desperdiciados en 4 webp) | Pendiente — generar variante thumb al asignar cover (backend `uploads`) o redimensionado R2/CDN + `srcset`/`sizes` en cards. Blocker del LCP restante |

## ✅ Fase 7 — Covers: álbum obligatorio + WebP + caché inmutable (Resuelta)

> `Song.cover_url` hereda `album.cover_key` (migración `0009` dropea
> `songs.cover_key`); `SongCreate.album_id` obligatorio (quitarlo = 400);
> borrar álbum con canciones = 400; covers solo WebP ≤ 256 KB con
> `Cache-Control: public, max-age=31536000, immutable` firmado en el presign +
> backfill de los 27 `covers/*` históricos (`scripts/backfill_cover_cache.py`).
> Panel sin cover propio en songs + álbum siempre requerido. OJO: el edge de
> Cloudflare puede capar el TTL (visto `max-age=14400` con `cf-cache-status:
> HIT`) — agregar Cache Rule `/covers/*` en el dashboard si sigue así.

| # | Tarea | Estado |
|---|---|---|
| 63 | **Verificación Fase 7** | `uv run pytest` = **111 passed** · `uv run alembic upgrade head` (0009 en dev) · web typecheck/lint/**40 tests**/build OK · regen tipos · E2E API (422/400/400/400+presign firmado + limpieza) y browser (dedup 26 imgs→7 URLs, panel sin cover en songs, copy WebP/256KB/800×800, 0 errores consola) OK |

## ✅ Resueltas (M4A en el panel — subida e import ZIP)

| # | Tarea | Resolución |
|---|---|---|
| 64 | **M4A end-to-end + probe con pista de audio** | El presign acepta `audio/mp4`, `audio/x-m4a` y `audio/m4a` (→ `object_key` `.m4a`) y el import por ZIP acepta `.m4a` (se guarda como `audio/mp4`), en Python y en el Worker. El probe MP4 EXIGE al menos una pista de audio (`moov/trak/mdia/hdlr` = `soun`) en ambos backends — Worker en `lib/audio.ts`, Python con `mutagen.mp4.Atoms` — así un MP4 **sin pista de audio** se rechaza (`failed`, "no es un audio válido") en vez de importarse (un video con pista AAC sí pasa: es audio). Paridad con mutagen: la duración sale del `mdhd` de esa pista (el `mvhd` no se usa; `duration = 0` → `None` pero reconocido), `ftyp` no tiene que ser la primera caja y el redondeo es half-to-even. Tests en ambos lados (`test_presign_m4a`, `test_import_zip_accepts_m4a_extension`, `test_import_zip_rejects_video_renamed_to_m4a`, `test_audio_probe.py`, `audio.test.ts`, `album-zip-import.test.ts`) con fixtures M4A compartidos (`src/lib/__fixtures__/mp4.ts`) que incluyen `trak/mdia/hdlr` + `mdhd` |

**Detalle por tarea (archivos · criterio de "hecho" · dependencias):**

- **52** — `apps/api/app/features/playlists/{repository,service,router}.py` +
  `apps/api/tests/test_playlists.py`. Endpoint **`GET /me/playlists/containing?song_id=`**
  en `me_router` (respuesta `list[uuid.UUID]`; sin conflicto de ruta: no existe
  `GET /me/playlists/{id}`). Repository: `playlist_ids_containing_song(song_id)`
  (query a `PlaylistSong`). **Decisión duplicado: mantener `POST /playlists/{id}/songs`
  idempotente** (200 no-op, comportamiento actual en `repository.add_song` + test
  existente `test_add_and_remove_songs_with_order`); agregar test explícito: POST
  repetido → 200, `song_count` sin cambio, sin filas duplicadas. Tests: contiene /
  no contiene / `[]` sin playlists / 401 sin sesión. Hecho: `uv run pytest
  apps/api/tests/test_playlists.py` verde.
- **53** — `apps/api/tests/test_favorites_library.py` +
  `apps/api/tests/test_playlists.py`. Test espejo de
  `test_favorite_song_with_album_lists_album`: canción **sin** álbum favorita →
  `GET /me/favorites` devuelve `album: null`; detalle de playlist con canciones sin
  álbum → `songs[].album is null`. Auditoría frontend (sin cambios esperados:
  `SongItem`, `SongCard`, `song/[id]/page.tsx` ya guardan con `song.album &&`,
  panel usa `?.`): ninguna card/lista linkea a `/album/[id]` ni inventa placeholder
  cuando `album` es null. Hecho: pytest verde + auditoría documentada.
- **54** — `pnpm gen:types` (API corriendo) → `packages/api-types/src/generated.ts`
  con el endpoint nuevo; `pnpm --filter @pulse-stream/web typecheck` OK.
  **Depende de 52.**
- **55** — `apps/web/components/playlist-picker.tsx` +
  `apps/web/lib/services/playlists-service.ts` (método `getPlaylistIdsContaining`)
  + `apps/web/components/playlist-picker.test.tsx`. Fetch **lazy al abrir** el
  dropdown (`?song_id={song.id}`) → set de playlist_ids; filas contenidas →
  deshabilitadas con check + "Ya está en esta playlist"; toast neutro si el POST
  idempotente responde con la canción ya presente. Tests vitest: fila deshabilitada
  cuando contiene / habilitada cuando no / fetch on open. **Depende de 54.**
- **56** — `apps/web/components/playlist-card.tsx` (prop `compact?: boolean`: cover
  chica — ej. `h-16 w-16` en vez de `aspect-square` —, paddings/textos menores) +
  `apps/web/app/(protected)/dashboard/catalogo/page.tsx` (usar `compact` en la
  sección Playlists). El grid del resto de la app queda igual. Hecho: typecheck +
  vitest OK.
- **57** — `apps/web/app/(protected)/dashboard/catalogo/page.tsx`. Sección Canciones
  sin `q`: `limit: 10` (sin `Pagination`) + botón **"Ver todas"** →
  `/catalog/songs`; con `q` se mantiene el filtro client-side (ventana 200) y se
  oculta "Ver todas". Estado vacío existente se conserva.
- **58** — Nuevos: `apps/web/app/(protected)/catalog/songs/page.tsx` (server:
  sesión + `getUserLibrary` para acciones), `songs-list.tsx` ("use client":
  IntersectionObserver en sentinel, `GET /me/favorites` offset/limit **20**, append
  de páginas, spinner, estado vacío "Todavía no guardaste canciones…", `SongItem`
  con like/playlist/descarga), `loading.tsx` (skeleton propio). **Depende de 57**
  (ruta destino del "Ver todas").
- **59** — Mover a top-level en `(protected)`: `dashboard/catalogo` → `/catalog`,
  `dashboard/canciones` → `/songs`, `dashboard/configuracion` → `/settings`,
  `dashboard/search` → `/search`, `dashboard/playlists` → `/playlists` (+ `[id]`),
  `dashboard/recently-played` → `/recently-played`, `dashboard/favorites` →
  redirect a `/catalog`. Redirects viejos con páginas `redirect()` (patrón
  existente `dashboard/favorites/page.tsx`). Actualizar: `components/dashboard-shell.tsx`
  (SidebarNav), `components/bottom-nav.tsx` (hrefs + `router.push`), `proxy.ts`
  (matcher + guard: `/catalog`, `/songs`, `/settings`, `/search`, `/playlists`,
  `/recently-played`), `app/manifest.ts` (shortcuts), `components/bottom-nav.test.tsx`,
  links internos (`dashboard/page.tsx`, `account/account-form.tsx`,
  `panel/playlists/playlists-manager.tsx`, `playlists/create-playlist-form.tsx`,
  `playlists/[id]/playlist-actions.tsx`, `playlists/[id]/page.tsx` → `/songs`,
  `catalogo/page.tsx` → `/playlists`) y **AGENTS.md sección 2**. Hecho: typecheck +
  lint + vitest + recorrido manual de redirects. **Depende de 57 y 58** (mueve las
  páginas que crearon/editaron).
- **60** — `apps/web/app/(protected)/songs/page.tsx` (post-move). Separar
  conceptos: `/catalog` = canciones **agregadas** (favoritos) vs `/songs` =
  **explorar** catálogo (`GET /songs?q=`). Verificar por qué el input no funciona
  (flujo `SearchInput` → `?q=` → refetch; reset de offset; que NO filtre la
  biblioteca del usuario ni se quede en la primera página). Hecho: escribir en el
  input → resultados del catálogo público; verificación manual + test vitest si
  aplica. **Depende de 59.**
- **61** — `uv run pytest` (suite completa, incl. tests nuevos) · `pnpm gen:types` ·
  web typecheck/lint/test/build · recorrido manual (picker "Ya está", catálogo
  10+Ver todas+infinite scroll, rutas nuevas + redirects, buscador `/songs`, cards
  compactas, canciones sin álbum). Actualizar `tasks.md` (52-60 → Resuelto) y
  `README.md` si corresponde. **Depende de 52-60.**

## ⏳ Roadmap propuesto para una app de música (próximas pasadas)

| Feature | Por qué | Estado |
|---|---|---|
| Letra sincronizada con timestamps (LRC) | El fullscreen ya tiene la vista de letra; falta el sync por línea | Idea |
| Cola de reproducción visible (up-next) + shuffle/repeat | El player ya tiene cola interna; falta UI de "próximas" y modos | Idea |
| Perfiles públicos de usuario (`/user/[id]`) con playlists y favoritos | Hoy solo existe el feed de playlists con autor | Idea |
| Búsqueda global con ⌘K | La búsqueda está en `/search`; falta el atajo global | Idea |
| CRUD de usuarios en el panel (listar, asignar roles por UI) | Backend listo (`/admin/users`, `PATCH role`); falta pantalla | Pendiente |
| Editar playlist en la UI (nombre/descripción/visibilidad/cover) | Backend listo (`PATCH /playlists/{id}`); falta formulario | Resuelto (Fase 5 — `playlist-edit-form.tsx`) |
| Botón maestro "reproducir playlist completa" | El `SongItem` ya acepta cola; falta el botón en el header de playlist | Resuelto (Fase 5 — `playlist-play-button.tsx`) |
| Búsqueda en `GET /songs` también por artista (JOIN) | Hoy busca solo por título | Pendiente |
| Editar álbum (cover, título, canciones) desde su página | El panel crea y borra álbumes; falta el form de edición | Pendiente |
| Página pública de usuario (`/user/[id]`) con sus plays/favoritos | Los contadores ya existen (`total_plays`, `user_play_count`) | Idea |
| Notificaciones push de nuevas canciones/playlists | Requiere suscripción + VAPID; PWA ya está | Idea |
| Recomendaciones por género/gustos | El backend guarda géneros + listens; se puede rankear por afinidad | Idea |
| Compartir canciones/playlists (links/embeds) | Social; requiere URLs públicas de playlist | Idea |
| Valoraciones de playlists (seguir/favoritear) | Tabla nueva + contador | Idea |
| CSRF (double-submit cookie) antes de producción | Bloqueador de seguridad pendiente (`core/security.py`) | Pendiente |
| Limpieza del storage offline (gestor de descargas) | Hoy se guarda/borra por canción; falta un listado central | Resuelto (Fase 5 — Configuración: peso + eliminar cache) |

## ⏳ Pendientes / ideas para próximas pasadas (histórico)

| # | Tarea | Estado |
|---|---|---|
| 1–10 | Fase 3 resuelta | Ver sección anterior |
| 11–21 | Fase 3b resuelta | Ver sección anterior |
| 16 | CRUD de usuarios en el panel | Backend listo (`/admin/users`, `PATCH role`); falta pantalla |
| 31 | Bugs funcionales | Al cargar un nuevo album y subirlo, no se elimina el preview, no se cierra el form y no se hace refetch

## CI/CD del rewrite (F9)

| Item | Alcance | Estado |
|---|---|---|
| **Tests** | `.github/workflows/tests.yml`: solo unitarios (worker `test:unit` + web vitest) en cada `pull_request`, sin DB ni secrets | Hecho |
| **CI (integracion)** | `ci.yml` pasa a `push: master` + `workflow_dispatch`: pytest, vitest con Neon, typecheck/lint/build del web y `generated.ts` pinneado | Hecho (job `api` de pytest eliminado al deprecar el backend Python — ver *Pendientes de infraestructura*) |
| **Deploy API Worker** | `.github/workflows/deploy-api-worker.yml`: migraciones con la URL directa, `wrangler deploy`, `wrangler secret bulk` desde GitHub, smoke `/health`/`/genres`/`/artists`; environment `production` | Hecho (hoy es reusable, gateado por el hub — ver *Pipeline CI/CD sellado*, CI-2) |
| **Config del Worker** | `wrangler.jsonc` con `routes` del custom domain y `vars` no secretas; secretos de runtime solo en GitHub (fuente de verdad) | Hecho |
| **Deploy web** | Vercel con su integracion de Git (sin workflow); envs `NEXT_PUBLIC_API_URL`, `ENV=prod`, `COOKIE_DOMAIN`, `COOKIE_SAMESITE` | Manual (dashboard) |

> Estos workflows quedaron reemplazados en el pipeline CI-1..CI-3 por
> **`PR checks`** (`tests.yml`) y el hub **`Master Pipeline`**
> (`deploy-pipeline.yml`) + sus spokes (`ci-master.yml`, `deploy-api-worker.yml`,
> `database-migrations.yml`) — ver la sección al final del ledger.

## Rediseño del home estilo Spotify (F0-F2) — Resuelta

Rodada cerrada con el flujo coder/reviewer por fase. Referencia medida del layout
en `LAYOUT_AUTH_USER.md` (perfil autenticado vía MCP browse); el análisis previo
sin MCP quedó archivado en `LAYOUT_UNLOGGED_USER.md`.

| Fase | Alcance | Estado |
|---|---|---|
| **F0** | Primitivas de layout: `MediaCard` (card sin caja estilo Spotify, play 48px, a11y con título en el label), `Carousel` (snap + flechas lg + ResizeObserver + reduced-motion), `Section`, `Chips` (URL-synced), `CollageCard`, skeletons (`MediaCardSkeleton` con variante `boxed`, `CarouselSkeleton`, `CollageCardSkeleton`). `SongCard` refactorizado a wrapper fino de `MediaCard` sin cambiar su API | Hecho (reviewer: approved) |
| **F1** | `GET /me/top-songs?days=&limit=` **solo en el Worker** (Python deprecado: `apps/api/DEPRECATED.md`): ranking por usuario con 1 query + loader batcheado (4 queries, sin N+1), `SongWithPlays` reusado, desviación de contrato `WORKER_ONLY_PATHS` documentada y testeada, `generated.ts` regenerado, `listensService.getTopSongs` en el web | Hecho (reviewer: approved; 472/472 tests del worker) |
| **F2** | Home nuevo: saludo compacto + chips `Todo·Canciones·Playlists·Álbumes` (filtro server-side pre-fetch, `?tipo=` canonizado), shortcut grid 3 columnas (medido en Spotify: 3×477px), **"Lo más escuchado por ti" (7d) con fallback "Recién subidas" en la misma ranura (nunca ambas)**, carruseles (Seguí escuchando, Tus playlists, Álbumes que te gustan, Top semana, Comunidad, Top mes), Destacados como carrusel estándar de ContextMediaCard (se omite sin system playlists), `ContextMediaCard` con play perezoso client-side (`queueParams`, limit 25), `PlaylistPicker` en portal con clamp/flip vertical | Hecho (reviewer: approved) |

Fixes de review incorporados: popover del picker sin clipping (portal), z-index
del play bajo el popover, labels únicos por card, flip anclado al trigger (gap
202px → 13px), skeleton `boxed` donde el contenido aún tiene caja, tipografía
16/14 medida, `searchParams` robusto (repetidos/desconocidos → canónico).

Pendientes anotados (no bloqueantes, para fases siguientes): toast de error en
`ContextMediaCard`, cola sin `lyrics` (endpoint de ids), eq/pausa en collection
cards, `songCountLabel` duplicado, wrapper `relative` muerto del picker, CI de
pytest para el Python deprecado (decisión pendiente).

## F3 — Essentials por artista (playlists editoriales estilo Spotify) — Resuelta

Modelo editorial de Spotify: charts = snapshots globales que se regeneran;
essentials = una playlist por artista, sembrada con SU ranking all-time
(`songs.play_count`), curable canción a canción, **sin refresh automático**
(re-seed explícito con confirmación). Plan: `.opencode/plan/essentials-por-artista.md`.

| Fase | Alcance | Estado |
|---|---|---|
| **F3.1** | Worker: migración `0003` (`playlists.artist_id` + índice parcial unique por artista) y `0004` (FK `ON DELETE CASCADE` — fix del review que evitaba 500 al borrar artistas con essentials); `topSongsByArtist` (1 query all-time); `createArtistEssentials` (404/409, batch atómico) + lookup + `reseed` (400 tipado si no es essentials; 404 sin destruir curación si el artista quedó sin canciones); `refresh` → 400 para essentials; 3 rutas worker-only con gate generalizado (mapa método→statuses) + `WORKER_ONLY_COMPONENTS`; `PlaylistEssentialsCreate`; `ESSENTIALS_LIMIT=20` única fuente. Desviación documentada: `artist_top` NO entra al enum compartido (evitaba un segundo camino de creación sin `artist_id`/409) — el valor vive en DB, el DTO da `query: null` | Hecho (reviewer: approved; suite worker 486/486) |
| **F3.2** | Panel: `/panel/artists/[id]` con lookup server-side + botón "Generar Essentials" → estado "Essentials · N canciones" + Ver + **Re-sembrar con confirmación**; `/panel/playlists` con **curation una a una** (expandible lazy, quitar por fila, agregar con búsqueda debounceada, resultados filtrados); TODA mutación purga `CACHE_TAGS.playlists` (Destacados instantáneo); borrado de artista también purga (fix post-review) | Hecho (reviewer: approved; lint sin setState síncrono en effects) |
| **F3.3** | Generación masiva por el flujo del producto: "Bad Bunny Essentials" regenerada por el botón (20 canciones all-time, antes era un hack de `top_week` con curación por API), "Daddy Yankee Essentials" (13), Enrique Iglesias fuera (umbral ≥5), Bastille fuera (1 canción) | Hecho |

Home logueado completo: "Destacados" muestra las 2 essentials como carrusel
estándar de cards (captura `docs/spotify-auth/14-f33-destacados-essentials.png`).

Pendientes anotados de F3: refresh del listado del panel tras `confirm()` de
borrado (DOM stale, se corrige al navegar), carrera de creación duplicada
(`23505 → 409`) sin test determinista, `findArtistEssentials` repite shape (dejado
a propósito), nits 6-11 del review F3.2 (toast vs banner, 409 refetch, estado
muerto al borrar expandida, actions.ts compartido, docstring de useDebounce,
`no-store` explícito en loadDetail).

## Pasada de nits de UI — Resuelta

Reportados por el usuario con capturas y verificados en vivo: (1) la fila de
canción sin cover no renderizaba el slot y el play se corría a la izquierda;
(2) "Destacados" usaba cards gigantes (collage 2-up con el título fuera del
viewport) en vez del tamaño estándar de las demás secciones.

| Item | Alcance | Estado |
|---|---|---|
| **`NoCover` global** | `components/no-cover.tsx`: logo de Pulse Stream centrado + borde, shapes square/circle, sizes sm/md/lg. Reemplaza los fallbacks de "letra inicial" en filas (`song-item`), cards de grilla (`media-card`), player bar + fullscreen, heroes de playlist/álbum, `AlbumCard`/`PlaylistCard`, listas del panel y los swaps del review (`/playlists`, discografía del artista, `/search`). Avatares de persona y tiles de diseño propio quedan fuera a propósito | Hecho (reviewer: approved) |
| **Destacados normalizado** | Carrusel estándar de `ContextMediaCard` (196px, idéntico al resto de las secciones). `CollageCard` y `CollageCardSkeleton` eliminados: el home tiene una sola clase de card | Hecho (reviewer: approved) |
| **A11y** | Links de cover con `aria-label` en `song-item` y `artists-results` (eran focusables sin nombre accesible) | Hecho |
| **Datos** | Ambas Essentials regeneradas 100% desde el panel (Bad Bunny y Daddy Yankee) | Hecho |

## Pasada de hardening — Resuelta

Seis hallazgos investigados con evidencia (4 aplican, 1 aplica como tradeoff de diseño, 1 no aplica en lo esencial pero sí su camino de error). Fixes verificados en vivo y aprobados por review.

| Item | Fix | Estado |
|---|---|---|
| **Posiciones de `playlist_songs`** (adds concurrentes duplicaban `position` sin error) | Migración `0005`: renumeración global (repara duplicados) + `UNIQUE (playlist_id, position)`; retry del INSERT ante unique violation; offset `+1_000_000` en el remove para la colisión transitoria del índice non-deferrable (testeado quitando la PRIMERA canción). `replacePlaylistSongs` no lo necesita (DELETE-all en la misma transacción) | Hecho (reviewer: approved) |
| **Curación con respuestas fuera de orden** | Guard `if (pendingSongId) return;` + `finally` funcional en el panel; segundo click no dispara otra mutación | Hecho |
| **Borrado de artista** | `onMutated()` no bloquea la salida, modal se cierra en error, sin `router.refresh()` redundante | Hecho |
| **Resize del PlaylistPicker** (`Node.contains(window)` lanzaba TypeError y el panel quedaba anclado) | Handler dedicado `onResize` + `maxHeight` calculado al abrir en ambas ramas | Hecho |
| **Saludo con hora del server** (UTC en Vercel → 3h de error en ART) | `Greeting` client: `initial` del server (sin mismatch) y recálculo con la hora del browser vía rAF | Hecho |
| **Chips sin feedback durante la navegación RSC** | `useTransition` + `aria-busy` + atenuado (el filtrado server-side queda igual) | Hecho |

Nota: el test de renumeración que falló con timeout durante la pasada era
latencia de red (15 requests secuenciales a Neon a ~1.3s), no un hang —
reproducido contra el worker: el DELETE del remove responde en ~1.3s. Se
amplió su timeout a 40s con comentario.

## Pendientes de infraestructura (CI / migraciones)

| # | Tarea | Estado |
|---|---|---|
| 1 | Migración Drizzle **`0000_baseline`** (esquema completo en un solo baseline) | Pendiente — es lo que permite dropear el bootstrap Alembic de la base de test y el paso `Python schema` de `ci-master.yml`; hasta entonces el Worker depende de `apps/api` solo como infraestructura de test |
| 2 | Secret **`TEST_DATABASE_URL`** de GitHub | Sin uso desde que se eliminó el job de pytest de la API Python (el Worker usa `TEST_DATABASE_URL_WORKER`) y purgable cuando el baseline esté; se deja por si hace falta un checkout del Python deprecado |
| 3 | Workflow manual **`db-migrate.yml`** (aplicar migraciones Drizzle sin deploy) | Cancelado por ahora; planeado para una fase posterior. Hasta entonces `db:migrate` se corre a mano con guard (`CONFIRM_TARGET`) |

> **Verificación de cada fase**: `pnpm typecheck` no incluye el Worker, así que
> cada fase cierra con `pnpm --filter @pulse-stream/api-worker typecheck`
> además de su suite. `vitest` transpila sin chequear tipos: un fixture
> incompleto (`PlaylistRow` sin `artistId`) pasaba los tests y solo rompía `tsc`.

## Pipeline CI/CD sellado (CI-1..CI-3)

| Fase | Alcance | Estado |
|---|---|---|
| **CI-1** | `tests.yml`: job único renombrado **"PR checks"** con todo lo barato que antes solo corría en master (menos la integración con Neon): worker `typecheck` + `test:unit`, web `typecheck → lint → test`, `export:openapi` + `gen:types:worker` + `git diff --exit-code` sobre `generated.ts`, `timeout-minutes: 10`, sin DB ni secrets. Lección del fixture `artistId`: `tsc` del worker entra al PR | Hecho (approved, verificado en el runner) |
| **CI-2** | Pipeline de master en **hub-and-spokes** (decisión del usuario, rework sobre el workflow único): `deploy-pipeline.yml` es el **único workflow de CI+deploy con `on: push`** (`database-migrations.yml` también escucha push pero sólo con paths de migraciones) — hub de ruteo sin steps (`changes` con paths-filter + `fetch-depth: 0` → `ci` → `deploy-api-worker`) y `if` compartido + `needs` como gating; `ci-master.yml` reusable (`workflow_call` + dispatch de debug, `concurrency: master-ci` serializada) con `web` + `api-worker` verbatim; `deploy-api-worker.yml` reusable (`environment: production`, dispatch directo = **bypass de emergencia** sin CI); `database-migrations.yml` por paths de `migrations/**`/`schema.ts` con gate `db:check` → `db:migrate`; secrets por `inherit` (repository) y `environment` sólo en los jobs de deploy/migración. `master.yml` eliminado. Docs al día | Hecho (esta fase) |
| **CI-3** | Branch protection: required check **"PR checks"** (el rename de "Unit tests" ya está hecho) y verificación end-to-end real de master al mergear el pipeline (hub → `ci-master` → `deploy-api-worker` → smoke de prod) | Pendiente |

Recordatorio para CI-1/CI-3: el nombre mostrado del job es el contrato con
branch protection; si cambia, hay que actualizar la regla.

## Aceleración de la suite de integración — Fase 1 (seeds con `db.batch`) — Resuelta

Cada fixture seedeaba el catálogo por API (artista + álbum + canciones ×N +
play_counts = 6-8 HTTP por seed); con ~1.4 s/round-trip en redes lentas, el
test "lookup por artista" de essentials encadenaba ~13 requests ≈ 19.5 s y
explotaba el `testTimeout: 20_000`.

| Item | Alcance | Estado |
|---|---|---|
| **`seedCatalogBatch`** (`tests/catalog-helpers.ts`) | UN `db.batch` (1 round-trip, transacción del lado de Neon): artist → album → songs con `play_count` directo → `song_collaborators`. Filas idénticas a las que crean los services; única diferencia documentada: `created_at`/`updated_at` explícitos crecientes (+1 ms por canción — en un batch todas comparten `now()` y el snapshot `new` desempataría por uuid → flaky). Las ventanas de `days` no se afectan: filtran por `listens.played_at` (inserts con `now()` real) | Hecho (reviewer: approved) |
| **8/8 suites de arrangement migradas** | essentials, listens, plays, favorites, favorites-library, playlists, playlists-me, playlists-system. Las de alta (songs/artists/albums/covers/zip/uploads/auth/users) siguen por API a propósito: ahí el alta ES el test. `setPlayCount` sobrevive solo en essentials (comportamiento, no preparación) | Hecho |
| **Medición** (red ~1.4 s/round-trip) | `playlists.test.ts` 123.7 s → **93.0 s** (−25%); el test del timeout pasó de ~13 requests ≈ 19.5 s a **~7 ≈ 10 s** (0 timeouts); suite completa 488/488 | — |
| **Fix del fix** | El `noUncheckedIndexedAccess` obligó a `s1!` en bindings desestructurados; un fix por regex de PowerShell rompió el UTF-8 de 2 archivos (mojibake en 4 asserts) — restaurados y re-aplicados con herramienta de edición. Lección: regex masivos sobre UTF-8 van con herramientas de edición, nunca `Set-Content` | Resuelto |
| Diferido (cosmético) | `songIds.map((id) => ({ id }))` unificable en 4 archivos (favorites, listens, plays, playlists) — sin efecto en asserts ni tiempo | Anotado |

## Sección Explorar — rediseño de la búsqueda estilo Spotify

Investigación con browse MCP (perfil autenticado, medición en vivo): la vista
"Todo" de `/search/Fe` es fila hero del artista matcheado (foto **cuadrada**
72px, no circular) → shelf **"Incluye a Feid"** (~10 playlists editoriales,
covers 109px) → canciones (match título O artista) → mezcla álbumes/listas.
"Incluye" solo aparece con un match de artista dominante (con "Far" no existe)
→ sin personalización, nuestra traducción es "Incluye {q}" siempre, con
álbumes+playlists barajeados. La vista filtrada Artistas = grid de cards
cuadradas 166px. La landing `/intl-es/search` se titula "Explorar todo"
(grid de géneros). Nota: `open.spotify.com/search/results/*` ya no existe.
Evidencia: `docs/spotify-auth/20-23`.

| Fase | Alcance | Estado |
|---|---|---|
| **F-B1** backend | `GET /songs?q=` extendido a título/artista/colaborador (EXISTS correlacionado, contains) + `sort=plays` (play_count DESC, id ASC; con `playlist_id` gana position); `GET /playlists/public?q=` por nombre manteniendo `systemFirstOrder`. Params aditivos, sin migraciones, sin componentes nuevos del contrato (el gate NO compara query params — verificado en `contract.ts`). Tests: `tests/search.test.ts` (7) + nits del review (parentización del OR con `artist_id`, system-first bajo `q`). Reviewer: **approved** | Hecho (commit `14bf1a7`) |
| **F-B2** frontend | `/search` reescrito: h1 "Explorar", sin BackLink, 3 secciones con `<Suspense>` propio — Artistas (`ArtistCard` cuadrada nueva sobre MediaCard, carousel 150/168px), Incluye "{q}" (álbumes+playlists merge tipado + Fisher-Yates por request, cap 12, MediaCard directo para silueta uniforme), Canciones (filas `SongItem` con acciones completas, `sort=plays`, paginación client-side). **Bug del review cazado con reproducción en vivo**: faltaba `key={query}` en `SearchSongsResults` → el estado (songs/offset/total) persistía al cambiar la query sin recargar; fix de 1 línea + verificación del flujo completo (bad→daddy→bad + "Ver más" 24→38 sin contaminación). Reviewer: resto approved (datos por usuario no-store, shuffle no rompe cache, `SearchSongsSkeleton` muerto eliminado) | Hecho (commit `0bf2c20`) |
| **F-B3** rename nav | Label "Buscar" → **"Explorar"** en sidebar/drawer (`dashboard-shell.tsx`) + bottom nav + su test + CTA de recently-played ("Explorar canciones") + limpieza de los 2 imports muertos de `recently-played/page.tsx` (warnings de lint). La **ruta `/search` NO cambia** (proxy/redirects intactos) | Hecho (`45f7ab3` + `1e4802a` shortcut PWA) |
| **F-B4** filtro género | Param `genre` en `GET /songs` (`songs.genres::jsonb ? $n` en `songConditions`, list+count sin drift). Enum de query separado sin `refId` (`.nullable()` sobre refId re-registraría el componente `SongGenre` con null); tuple `SONG_GENRES` = única fuente (body, query, `GET /genres`, mismo orden). Test que **documenta el encoding `r%26b`** (la trampa: sin encodeURIComponent el `&` parte la URL → 422) | Hecho (commit `460fddc`, reviewer: approved) |
| **F-B5** landing Explorar | Estado sin búsqueda = descubrimiento **global** (distinto del dashboard personal): Populares ahora (filas, `/songs/popular?days=7`) · Recién llegado (carousel de álbumes) · **Explorar todo** (mosaico de `GenreCard`, paleta `color-mix` solo de tokens de marca, hash determinista, contraste medido ≥4.9 en las 12) → `/songs?genre=` con chip validado contra `/genres` (link inválido degrada sin 422), remount `query:genre`, SearchInput preserva params. **Fix del review (bug pre-existente)**: `q` repetido como array tiraba el error boundary de `/songs` — normalizado igual que `genre`; ✕ del chip a 24px | Hecho (commit `38d389d`, reviewer: approved) |
| Diferido | Nits del review F-B5: extraer `refreshLibrary` duplicada (2 server actions inline idénticas), 4 colores más para el mosaico (12 géneros / 8 colores → rock==classical), validación de géneros dentro del boundary; GIN funcional sobre `(genres::jsonb)` cuando haya volumen | Anotado → **resuelto en F-C2** (extracción a `actions.ts`, 5 copias → 1) |

## Página de artista + nav (PR "artist page + nav") — investigación Spotify (`docs/spotify-auth/26-27`)

Spotify (medido en vivo): hero foto + "oyentes mensuales" → **Populares** (filas por plays con count visible) → **Discografía** ("año • Álbum") → **Incluye a {artista}** (playlists que lo featuran) → Aparece en al final. Hallazgo de diseño: la Essentials del artista es una playlist pública con sus canciones → **ya aparece primera en el feed `artist_id`** (systemFirstOrder) — no hace falta llamar a `getArtistEssentials`.

| Fase | Alcance | Estado |
|---|---|---|
| **F-C1** backend | `GET /playlists/public?artist_id=`: playlists cuyo contenido incluye canciones donde el artista participa (principal o colaborador — EXISTS anidado membership). Refactor: `publicPlaylistConditions()` compartido list+count (mismo WHERE por construcción), count a objeto de filtros. `systemFirstOrder` intacto, combinable con `q` | Hecho (commit `ce7d61f`, reviewer: approved; nit "pasar el objeto completo al count" aplicado) |
| **F-C2** frontend | Página de artista rehecha: hero con cover real (overlay gradient `opacity-90`), **Populares** (`sort=plays`, LoadMore con sort en cada página), **Discografía** (`AlbumCard` en Carousel con subtítulo custom "N canciones · año UTC" — fin del grid casero), **Incluye a {nombre}** (feed `artist_id`, system → "Curada por Pulse Stream"), Colaboraciones al final. `key={id}` remonta artista→artista. Nits aplicados: `onMutated` cableado con `refreshLibrary` extraída a `app/(protected)/actions.ts` (5 copias inline → 1; un like desde la página purga favorites — verificado en vivo con reversibilidad) | Hecho (commit `56b3a2a`, reviewer: approved) |
| **F-C3** nav | Panel + Cuenta del bottom-bar → sidebar (Principal = Inicio · Explorar · Cuenta; Panel ya vivía en Administración). Bottom-nav queda Inicio · Explorar · Catálogo · Crear(+) **sin props** (`user`/`isAdmin` muertas eliminadas), como Spotify mobile. Test nuevo del shell (Cuenta en sidebar + Panel solo admin) | Hecho (browser-verified: barra de 3+Crear, drawer con Cuenta/Panel, activo en /account) |
| Diferido | Nits del review F-C2: `releaseYear` en realidad es año de agregado al catálogo (sin `release_date` en backend), Incluye cap 10 sin "Ver más" | Anotado |

## Cola de reproducción con contexto perezoso — PR `feat/queue-context`

Investigación con browse MCP (cola real de Spotify medida): reproducir "DtMF"
desde Populares del artista armó **"Siguiente de: Bad Bunny Popular"** (la
sección como contexto nombrado) y al acabarse los 5 visibles **siguió con más
del artista que no estaba en la lista** (Autoplay). Apple Music: mismo
principio + estación ∞ al agotar. La regla: la cola se ancla a un **contexto
con nombre**, jamás al slice de DOM cargado.

Inventario propio (file-explorer, línea por línea): `play(song, queue)` recibe
el array materializado → playlist de 300 reproduce **20 congeladas** (botón
del hero), artista 10 de 38, `/songs` 24, `ContextMediaCard` tope 25
hardcode, `/song/[id]` pasa undefined (tema huérfano, índice -1), `onEnded`
**se detiene**, sin UI de cola ni append. Único caso con resolución de
contexto: `ContextMediaCard` (fetch al click, cap 25).

| Fase | Alcance | Estado |
|---|---|---|
| **Q1** motor | `PlayContext` descriptor (`label` + `loadPage(offset, limit)`) en el provider: `play(song, context, seed)` materializa perezoso (fetch de a 50 al llegar al final, inflight único, dedupe por id); hasNext refleja "materializado O contexto con más". Superficies → descriptores: playlist (paginado), álbum (getAlbumById completo ASC — corrige el orden DESC), artista Populares/Colaboraciones, search Canciones, /songs, /catalog(+songs), dashboard (finitos: top-songs/recientes/populares), ContextMediaCard 25→contexto. Fixes: MediaSession gated por hasNext/hasPrev. **Cero backend** (endpoints existentes: /songs limit ≤100 orden estable, /me/favorites paginado, /albums/{id} completo ASC) | Hecho (commit `d729c7c`; reviewer approved con fixes: **raza de identidad de contexto durante fetch** —play de otra superficie no corrompe cola/offset—, posicionamiento en página 2+, key opaca; verificado en vivo: seed 10 → canción 11 del fetch perezoso, álbum ASC[0]→ASC[1]) |
| **Q2** cola anclada a la canción | `play(song)` sin contexto → arma la cola desde ESA canción: top del artista por plays (cap ~50), la elegida primera. Aplica a: **/recently-played** (mata el slice de 24 y el `as never`), `/song/[id]`, home público | Hecho (commit `b025e44`; reviewer approved — matemática offset-1/limit+1 revisada caso por caso, anónimos cubiertos por catch; verificado en vivo: Tarot → KLOuFRENS → Party, la radio, no la lista de recientes) |
| **Q3** cola visible | Tercera tab en PlayerFullscreen: "SONANDO" + "SIGUIENTE DE: {contexto}" (solo lo que viene, informativa) — el estado ya vivía en el provider | Hecho (commit `9bb9397`; reviewer approved; verificado en vivo: la lista se corre al avanzar 9→8) |
| **Q4** (diferida) | Autoplay al agotar el contexto (tras el top del artista → compañeros de género por plays), estilo Spotify/Apple. Comportamiento fuerte: merece decisión propia (¿toggle en settings?) | Anotada |
| Nits diferidos | Q1: `/recently-played` en RSC del dashboard sigue como array finito (desviación documentada); Q3: tabs "Ahora suena"/"Letra" redundantes en desktop, roles ARIA tablist/tabpanel, hint de cola perezosa cargando | Anotado |

## Nav móvil flotante + fixes de navegación — PR `feat/floating-bottom-nav` (#12)

| Fase | Alcance | Estado |
|---|---|---|
| **Nav flotante** | Bottom nav y player bar como pills flotantes (rounded-3xl 24px, borde completo, bg-bg-elevated/95 + blur, sombra), márgenes 16/12px y gap 6px; Crear en slot de icono 28px alineado con los labels; popup reposicionado. Desktop full-width como antes. Fixes del review: focus ring sin clipping, safe-area unificada (nav/player/popup), wrappers pointer-events-none | Hecho (reviewer approved con cambios aplicados; verificado a 390px) |
| **Loading al navegar (N2)** | Investigación rankeada: (1) fetch serializado en 2 niveles por navegación → `library.ts` en un solo Promise.all; (2) **SearchInput re-navegaba solo** (estado sin resync) → `lastNavigatedRef` + `adoptingRef` + guard anti-fantasma para la ventana `useSearchParams`-antes-que-prop RSC (cazada en vivo con Atrás); (3) el timeout de ofetch no cubría el body (único cuelgue literal) → `AbortSignal.timeout(30s)` sin retry; (4) `router.refresh()` duplicado tras `updateTag` fuera (un solo flash por mutación); (5) `getSession` null solo en 401 + `app/error.tsx` con Reintentar (un blip ya no desloguea) | Hecho (`db45a5b`; tests search-input 3/3; Atrás verificado en vivo: adopta y la URL queda estable) |
| Diferido | N3.2 Suspense interno en /recently-played, /playlists, /catalog/songs y panel (header pinta ya, datos streamean) | Anotado |



