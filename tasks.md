# Tasks — Ledger de tareas del proyecto

> Registro vivo de tareas nuevas detectadas durante el desarrollo (y su
> resolución). Cuando aparece una idea de mejora, se agrega acá y se resuelve
> en la misma pasada o en la siguiente.

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