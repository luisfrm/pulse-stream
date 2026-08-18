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

## ⏳ Roadmap propuesto para una app de música (próximas pasadas)

| Feature | Por qué | Estado |
|---|---|---|
| Letra sincronizada con timestamps (LRC) | El fullscreen ya tiene la vista de letra; falta el sync por línea | Idea |
| Cola de reproducción visible (up-next) + shuffle/repeat | El player ya tiene cola interna; falta UI de "próximas" y modos | Idea |
| Perfiles públicos de usuario (`/user/[id]`) con playlists y favoritos | Hoy solo existe el feed de playlists con autor | Idea |
| Búsqueda global con ⌘K | La búsqueda está en `/dashboard/search`; falta el atajo global | Idea |
| CRUD de usuarios en el panel (listar, asignar roles por UI) | Backend listo (`/admin/users`, `PATCH role`); falta pantalla | Pendiente |
| Editar playlist en la UI (nombre/descripción/visibilidad/cover) | Backend listo (`PATCH /playlists/{id}`); falta formulario | Pendiente |
| Botón maestro "reproducir playlist completa" | El `SongItem` ya acepta cola; falta el botón en el header de playlist | Pendiente |
| Búsqueda en `GET /songs` también por artista (JOIN) | Hoy busca solo por título | Pendiente |
| Editar álbum (cover, título, canciones) desde su página | El panel crea y borra álbumes; falta el form de edición | Pendiente |
| Página pública de usuario (`/user/[id]`) con sus plays/favoritos | Los contadores ya existen (`total_plays`, `user_play_count`) | Idea |
| Notificaciones push de nuevas canciones/playlists | Requiere suscripción + VAPID; PWA ya está | Idea |
| Recomendaciones por género/gustos | El backend guarda géneros + listens; se puede rankear por afinidad | Idea |
| Compartir canciones/playlists (links/embeds) | Social; requiere URLs públicas de playlist | Idea |
| Valoraciones de playlists (seguir/favoritear) | Tabla nueva + contador | Idea |
| CSRF (double-submit cookie) antes de producción | Bloqueador de seguridad pendiente (`core/security.py`) | Pendiente |
| Limpieza del storage offline (gestor de descargas) | Hoy se guarda/borra por canción; falta un listado central | Idea |

## ⏳ Pendientes / ideas para próximas pasadas (histórico)

| # | Tarea | Estado |
|---|---|---|
| 1–10 | Fase 3 resuelta | Ver sección anterior |
| 11–21 | Fase 3b resuelta | Ver sección anterior |
| 16 | CRUD de usuarios en el panel | Backend listo (`/admin/users`, `PATCH role`); falta pantalla |
| 31 | Bugs funcionales | Al cargar un nuevo album y subirlo, no se elimina el preview, no se cierra el form y no se hace refetch