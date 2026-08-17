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
