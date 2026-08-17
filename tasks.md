# Tasks — Ledger de tareas del proyecto

> Registro vivo de tareas nuevas detectadas durante el desarrollo (y su
> resolución). Cuando aparece una idea de mejora, se agrega acá y se resuelve
> en la misma pasada o en la siguiente.

## ✅ Resueltas (Fase 3 — módulos estilo Spotify)

| # | Tarea | Resolución |
|---|---|---|
| 1 | Módulo **playlists** con relaciones de DB | Tablas `playlists` + `playlist_songs` (posición, PK compuesta), CRUD completo, agregar/quitar canciones con renumeración, reglas de acceso (privada = solo dueño, pública = visible) |
| 2 | Módulo **favoritos** (like de canciones) | Tabla `user_favorites` (PK compuesta user+song), endpoints `GET/PUT/DELETE /me/favorites` + `GET /me/favorites/ids` para pintar corazones |
| 3 | **Covers** en canciones y artistas | Columna `cover_key` en `songs` y `artists` + `cover_url` calculado (dominio público R2). Endpoint `POST /uploads/presign-cover` (JPG ≤ 512 KB) |
| 4 | **Select** (combobox) en el UI kit | `components/ui/select.tsx`: listbox accesible, navegación por teclado (↑↓/Enter/Esc), opcionalmente buscable, variantes CVA + 8 estados |
| 5 | **BottomSheet** en el UI kit | `components/ui/bottom-sheet.tsx`: panel desde abajo con backdrop, ESC/click fuera para cerrar, animación respetando `prefers-reduced-motion` |
| 6 | **Bottom-sheet del reproductor** | Al tocar la barra inferior se abre la canción en grande: cover, título, artista, barra de progreso con seek, controles grandes, Media Session con artwork |
| 7 | **Favoritos en la UI** | Corazón en cada canción (home, artista, favoritos, playlists), estado optimista + revalidación por tags |
| 8 | **Playlists en la UI** | Página de listado + creación, página de detalle con canciones reproducibles, menú "agregar a playlist" (con opción crear nueva) en cada canción |
| 9 | **Panel más útil** | Stats del catálogo (artistas/canciones/con-cover), últimas canciones con badge de cover, editor de cover por artista y por canción |
| 10 | **Descripción del cover en el panel** | "Formato JPG · peso máximo 512 KB · tamaño sugerido 600×600 px (se muestra en cuadrículas)" + validaciones locales duplicadas del backend |

## ⏳ Pendientes / ideas para próximas pasadas

| # | Tarea | Estado |
|---|---|---|
| 11 | `PATCH /playlists/{id}` en la UI (editar nombre/descripción/visibilidad) | Backend listo; falta formulario de edición en el frontend |
| 12 | Cover de playlist en la UI | Backend soporta `cover_key` en playlists; falta el uploader en el detalle |
| 13 | Cola "reproducir playlist completa" (botón play en el header de playlist) | El `SongItem` ya acepta cola; falta el botón maestro |
| 14 | Búsqueda en `GET /songs` también por artista (JOIN) | Hoy busca solo por título |
| 15 | Tests frontend (Vitest + RTL) | Plan Fase 3: pendiente de configurar el toolchain |
| 16 | CRUD de usuarios en el panel (listar, asignar roles por UI) | Backend listo (`/admin/users`, `PATCH role`); falta pantalla |
