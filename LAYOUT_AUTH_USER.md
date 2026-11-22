# LAYOUT_AUTH_USER — Spotify Web (perfil autenticado) vs Pulse Stream

> **Metodología**: investigación hecha con el MCP **`browse`** sobre Brave (perfil
> real autenticado, usuario "Luis Rivas", 299 canciones likeadas), viewport
> 1920×951 y prueba a 390×844. Mediciones tomadas con `getBoundingClientRect` +
> `getComputedStyle` sobre el DOM en vivo (no a ojo).
>
> **Capturas**: `docs/spotify-auth/` (home desktop, home scrolleado, collage
> final, búsqueda vacía, resultados, playlist, álbum, artista, tus canciones,
> menú de perfil, ajustes, mobile).
>
> `LAYOUT_UNLOGGED_USER.md` es el informe anterior, hecho con el navegador
> embebido (sin el MCP y sin sesión). Queda archivado y **no** es la referencia.

---

# PARTE 1 — Inventario medido

## 1. Shell

```
┌───────────────────────────────────────────────────────────────┐
│ top bar 64px: [logo] [⌂] [buscador 480px]     [perfil][bell]  │
├──────────────────┬────────────────────────────────────────────┤
│ sidebar 404px    │ main (scroll propio)                       │
│ (368 colapsable  │  chips → shortcuts → shelves → collage     │
│  o rail 72px)    │                                            │
├──────────────────┴────────────────────────────────────────────┤
│ player bar 72px (márgenes de 8px a los lados)                 │
└───────────────────────────────────────────────────────────────┘
```

| Elemento | Medida real |
|---|---|
| Top bar | 64 px de alto |
| Buscador | 480 px, pill, fondo `#1f1f1f`, icono lupa + placeholder "¿Qué quieres reproducir?" |
| Sidebar expandido | 404 px (incluye padding); rail colapsado 72 px |
| Gap entre paneles | 8 px (se ve el negro del `body`) |
| Main | con sidebar expandido: `x=436`, ancho 1188; con rail: ancho 1536 |
| Player bar | **72 px**, ancho 1904 (x=8) |
| Fondo | `#000` en el shell; `#121212` en los paneles |

**Top bar**
- Izquierda: logo (icono, 32 px).
- Centro: botón circular "Inicio" (48 px) + **input de búsqueda** con botón de
  limpiar y botón de biblioteca a la derecha.
- Derecha: "Descubrir Premium" (pill blanca 32 px), "Instalar app", campana
  ("Novedades"), "Actividad de reproducción", avatar 32 px con badge de plan.
- El avatar abre **menú**: `Cuenta · Perfil · Recientes · Sube a Premium ·
  Asistencia · Descargar · Configuración · Cerrar sesión` + bloque "Tus avisos"
  embebido (los ítems externos llevan icono de "abrir en otra ventana").

**Sidebar "Tu biblioteca"** (captura `02-home-library-expanded.png`)
- Header: "Tu biblioteca" (16 px bold) + botón **Crear** (pill) + botón
  ampliar/contraer.
- **Chips**: `Listas · Artistas · Álbumes` (multi-selección; activo = fondo
  `#1f1f1f`, texto blanco).
- Banner promocional descartable ("Importa tu música desde otras aplicaciones")
  con gradiente violeta y CTA "Importar biblioteca".
- Lupa + criterio de orden ("Recientes").
- Filas de **64 px**: cover 48 px + título 16 px + subtítulo
  (`Lista • Spotify`, `Sencillo • ELENA ROSE`, `Artista`), hover
  `bg-highlight` y botón play a la derecha.
- Ampliada: mismo contenido como **grid de cards** (~6 columnas) a todo el ancho.

**Responsive real (importante)**: Spotify Web **no es responsive**. A 390 px de
ancho el layout sigue en modo escritorio (rail 72 + main 416) y la página
**scrollea horizontalmente** (`scrollWidth 800` vs `clientWidth 390`). No hay
bottom nav en web. → **No copiar su mobile web**; nuestro `BottomNav` + drawer es
mejor y ya existe.

## 2. Home (`/`)

No hay saludo ni `<h1>` visible (el "Inicio" es sólo para lectores de pantalla).
El orden real, medido:

```
1. Chips            [Todo] [Música]                    (36px de alto útil)
2. Shortcut grid    2 columnas × hasta 4 filas
3. Shelves (10)     carruseles
4. Collage final    2 cards grandes por fila
```

### 2.1 Chips
- Altura **32 px**, radio pill, fuente **14 px**.
- Activo: fondo `#fff`, texto `#000`, padding `4px 12px`.
- Inactivo: fondo `rgba(255,255,255,.1)`, texto `#fff`.
- Gap 8 px. Filtran el contenido del home.

### 2.2 Shortcut grid
- Hasta **8 tiles**, grid de **3 columnas en desktop** (medido: 3×477px con gap
  12px sobre un main de 1456px), 2 en `sm`, 1 en móvil. Alto de fila **64 px**.
- Tile: cover 64×64 `rounded` + título 16 px bold; hover `bg-highlight`; play
  verde a la derecha en hover.
- En la cuenta usada había 4: "Canciones que te gustan", "Workout" y 2 más.

### 2.3 Shelves (carruseles)
Todas las secciones son `section[data-testid="component-shelf"]` con
`data-shelf="carousel"`.

**Medidas**
| Métrica | Valor |
|---|---|
| Card total | **196 × 248 px** |
| Cover | **172 × 172**, radio **6 px** |
| Padding interno de la card | 12 px |
| Pitch entre cards | 196 px → separación visual entre covers = **24 px** |
| Gap vertical entre secciones | **24 px** (medido: 24, 23, 24, 24…) |
| Título de sección (h2) | **24 px / 700** |
| Eyebrow | **12 px**, color `#b3b3b3` |
| "Mostrar todos" | **16 px**, blanco, sin subrayado (hover sí) |
| Scroll | contenedor propio con scroll-snap; flechas circulares 32 px al hover |

**Secciones observadas (en orden)**
| # | Título | Eyebrow / descripción | Cards |
|---|---|---|---|
| 1 | **Luis Rivas** | eyebrow "Hecho para" (el título es el nombre del usuario, linkeado) | 8 · playlist (Mix diario 1-6, Descubrimiento semanal, Radar de Novedades) |
| 2 | Tus mixes más escuchados | — | 4 · playlist |
| 3 | Recientes | — | 3 · playlist + collection + playlist |
| 4 | Tus listas | — | 6 · playlist |
| 5 | Álbumes con canciones que te gustan | — | 9 · album |
| 6 | Emisoras recomendadas | descripción: "Música sin fin basada en tus canciones y artistas favoritos." | 10 · playlist (radio, badge "RADIO") |
| 7 | **Bad Bunny** | eyebrow "Más como" | 10 · mix/álbum/playlist |
| 8 | Recomendada para hoy | descripción: "Inspirada en tu actividad reciente" | 9 · album |
| 9 | Tus artistas favoritos | — | 10 · artist (cover **circular**) |
| 10 | Emisoras populares | — | 9 · playlist |

Cada card: cover + **badge de fuente** arriba-izquierda (logo Spotify o sticker),
**botón play verde 48 px** abajo-derecha (aparece en hover/focus), título 16 px
bold (1 línea) y subtítulo 14 px `#b3b3b3` (clamp 2 líneas).

### 2.4 Collage final (captura `10-home-bottom.png`)
Cierre del home con cards **grandes** dentro de un carrusel:

| Métrica | Valor |
|---|---|
| Card | **456 × 593** (contenedor 480) |
| Columnas visibles | 2 |
| Composición | imagen de fondo + **título tipográfico dentro de la imagen** (2-3 líneas, ~40 px), sticker con el nombre arriba-izquierda, "Lista • Spotify" debajo |
| Caption bajo la card | eyebrow ("Especialmente para ti", "Para fans de Bad Bunny") |

Es el único bloque del home con jerarquía distinta: sirve para **destacar** 2-4
listas, no para navegar el catálogo.

## 3. Búsqueda

### 3.1 Estado vacío — "Explorar todo" (`11-search-empty.png`)
- H2 "Explorar todo" (24 px).
- Grid de **4 columnas** (desktop), tiles de **256 × 137 px**, radio **8 px**,
  gap **24 px**.
- Cada tile: color plano de fondo + título 24 px bold arriba-izquierda + cover
  rotada ≈-25° abajo-derecha (sangra fuera del tile), hover: `scale(1.02)`.
- Tiles: Música, Eventos en directo, Especialmente para ti, Novedades, Spotify
  Sessions, Latina, Pop, Hip hop, Listas de éxitos, Rock, Cumbia, Dance y
  electrónica, Estado de ánimo, Descubrir, Fresh Finds, Indie…

### 3.2 Resultados (`12-search-results.png`)
- **Chips**: `Todo · Canciones · Álbumes · Listas · Artistas · Perfiles ·
  Géneros y estados de ánimo` (mismas medidas que el home; la activa es blanca).
- **No hay encabezado "Resultados principales"** en esta versión. Va directo:
  1. **Top result**: card de fila **completa** (1140 × 104), fondo `#1f1f1f`,
     cover 64, título **24 px bold**, subtítulo `Lista • Spotify`; a la derecha
     check verde de guardado + **botón play verde 48 px**.
  2. **Lista unificada** de resultados: filas de **80 px**, thumb 56, título
     16 px + subtítulo 14 px, y a la derecha un **badge de tipo**
     (`Artista` / `Álbum` / `Canción` / `Lista`) sobre `#2a2a2a`, más la acción
     contextual: pill "Siguiendo" (artistas), check verde (guardado), "+"
     circular (no guardado) y "…" al hover.

## 4. Detalle de playlist (`13-playlist.png`)

| Elemento | Medida |
|---|---|
| Hero | **356 px** de alto, ancho completo del main, gradiente del color del cover |
| Cover | **232 × 232** (esquinas 4-8 px), a la izquierda |
| Eyebrow | "Lista pública" (12 px) |
| H1 | **96 px / 800**, line-height 1, tracking normal |
| Descripción | 14 px `#b3b3b3` |
| Meta | avatar 24 + dueño en bold + "guardada 6.355.723 veces" + "129 canciones" + ", " + "7 h 30 min aproximadamente" |
| Action bar | play **56 px** circular verde + shuffle + check/"+" + download + "…" · derecha: toggle Lista/⊞ |
| Tabla | header `# · Título · Álbum · Fecha en la que se añadió · ⏱`, filas de **56 px** |
| Fila | número → play al hover, "…", check verde junto a la duración |

- El hero **no** es una imagen de fondo: es cover + gradiente derivado del color
  dominante.
- La tabla tiene header sticky y zebra/hover; el "…" de cada fila abre un menú
  (añadir a playlist, ir al álbum, ir al artista, compartir, etc.).

## 5. Detalle de álbum (`14-album.png`)

Igual que playlist con:
- Eyebrow "Álbum"; meta `artista · 2023 · 20 canciones, 1 h 3 min`.
- Acciones: play, "Descubrir" (Canvas), shuffle, guardar, descargar, "…",
  toggle de columnas.
- Tabla **sin columna Álbum**: `# · Título · ⏱`.
- Sección final **"Más de {artista}"** (carrusel) + línea de copyright.

## 6. Detalle de artista (`15-artist.png`)

| Elemento | Medida |
|---|---|
| Banner | **1188 × 380** a sangre, imagen del artista + degradado al fondo |
| Nombre | sobre el banner, abajo-izquierda, ~96 px |
| Verificación | "Verificado/a por Spotify" con check |
| Métrica | "89,2 M oyentes mensuales" (y el número exacto en el tooltip) |
| Acciones | play 56, "Descubrir", shuffle, pill **"Siguiendo"**, "…" |

Secciones: **Populares** (5 filas con nº de reproducciones a la derecha) ·
**Discografía** (chips `Títulos populares / Álbumes / Sencillos` + carrusel) ·
**Aparece en** · **Incluye a {artista}** · **Información** · **Dónde se le puede
descubrir** · **Sus fans también escuchan** (artistas circulares) ·
**Aparece en**.

## 7. Tus canciones (`16-liked.png`)

- Hero violeta con cover generado (corazón), eyebrow "Lista", h1 96 px.
- Meta sin descripción: `Luis Rivas · 299 canciones, 17 h aproximadamente`.
- Acciones: play, shuffle, **descargar** (no hay "+": es auto-guardado).
- Tabla: `# · Título · Álbum · Fecha en la que se añadió · ⏱`.

## 8. Menú de perfil (`17-profile-menu.png`)

`Cuenta · Perfil · Recientes · Sube a Premium · Asistencia · Descargar ·
Configuración · Cerrar sesión` + "Tus avisos" inline. Ancho 300 px, ítems de
32 px, separador antes de "Cerrar sesión".

## 9. Configuración (`18-settings.png`)

- H1 **32 px**, columna centrada de **836 px**, fondo plano (sin card).
- Grupos con H2 16 px: Cuenta · Idioma · Calidad del audio · Tu biblioteca ·
  Visualización · Vídeos y Canvas · Reproducción · Insights y actividad de
  reproducción · Qué pueden ver otras personas en tu perfil.
- Filas `label 14 px` izquierda / control derecha.
- **9 toggles** pill verdes (56×32), selects, botones outline pill.

## 10. Reproductor

Barra de **72 px**, 3 zonas:

| Zona | Contenido y medidas |
|---|---|
| Izquierda | cover 56 + título 14 + artista 12 + ♥ + "…" |
| Centro | shuffle (32) · prev (32) · **play 32** · next (32) · repeat (32); debajo la barra de progreso con tiempos a los lados |
| Derecha | letra · cola (32) · conectar dispositivo (32) · mute (32) + slider de volumen + pantalla completa (32) |

- Click en la zona izquierda abre el **panel derecho** con cover grande y tabs
  **Letra / Cola**.
- En esta sesión el panel derecho estaba tomado por una promo de la app de
  escritorio ("Descarga Spotify para Windows"), que redujo el main a 1188 px.
  Es publicidad, no layout.

## 11. Patrones transversales (lo reutilizable)

1. **Una sola card** para playlist/álbum/artista/canción, con `shape` cuadrado o
   circular y play en hover.
2. **Carrusel** con scroll-snap + flechas al hover, sin scrollbar.
3. **Header de sección**: eyebrow 12 + título 24/700 + "Mostrar todos" 16 blanco.
4. **Hero de detalle** con gradiente del cover, título 96/800 y action bar de 56 px.
5. **Tabla de pistas** 56 px con columnas configurables y acciones al hover.
6. **Chips** de 32 px, activo blanco/negro, siempre en la URL.
7. **Collage** de 2 cards grandes para destacar contenido editorial.

---

# PARTE 2 — Comparación con Pulse Stream

## 2.1 Shell

| Pieza | Spotify | Pulse Stream hoy | Decisión |
|---|---|---|---|
| Top bar | 64 px con buscador global + perfil | Sólo móvil (logo + hamburguesa); en desktop no hay | **Agregar top bar desktop** con buscador global y menú de perfil |
| Sidebar | Biblioteca con filtros + lista | Nav por grupos (`dashboard-shell.tsx:38-110`) | Mantener nav; la biblioteca ya vive en `/catalog` (mejorar allí) |
| Player bar | 72 px, 3 zonas, transporte completo | 1 zona, sólo play/pause + chevron (`player-bar.tsx:27-104`) | **Completar** (prev/next/seek/like/volumen) |
| Panel derecho | Letra / Cola | No existe | Fase 5 |
| Bottom nav móvil | No tiene (web no responsive) | Sí (`bottom-nav.tsx`) | **Mantener: es superior** |

## 2.2 Home

| Spotify | Pulse Stream hoy | Propuesta |
|---|---|---|
| Sin saludo, arranca en chips | `"{saludo}, {nombre}"` + subtítulo (`dashboard/page.tsx:30-37`) | Saludo compacto (28-32 px) + chips debajo |
| Chips Todo/Música | — | `Todo · Canciones · Playlists · Álbumes` |
| Shortcut grid (8 tiles) | — | 4 fijos + 2 contextos recientes |
| **Hecho para {nombre}** | — | **"Lo más escuchado por ti" (7 días)** con fallback **"Recién subidas"** (nunca ambas) |
| Recientes | "Seguí escuchando" en grid de 5 (`:65-92`) | Mismo contenido, carrusel |
| Tus listas | — | "Tus playlists" + tile crear |
| Álbumes con canciones que te gustan | — | "Álbumes que te gustan" (`/me/favorites/albums`, hoy sin mostrar) |
| Emisoras / radios | — | No aplica (no existen) |
| Recomendada para hoy | "Recién agregadas" grid (`:94-127`) | "Recién subidas" carrusel |
| Tus artistas favoritos | — | Derivar de likes (fase 2) |
| — | "Más escuchadas esta semana" (`:129-156`) | "Top de la semana" carrusel |
| — | "Más escuchadas este mes" (`:158-185`) | "Top del mes" carrusel |
| — | "Playlists de la comunidad" (`:187-220`) | Carrusel |
| Collage final | — | **"Destacados"**: 2 cards grandes para las system playlists / top de la semana |

## 2.3 Componentes

| Patrón | Spotify | Pulse Stream |
|---|---|---|
| Card | Una, con play en todas | 3 componentes; play sólo en `SongCard` |
| Carrusel | Sí | **No existe**: todo grid `2/3/5` |
| Header de sección | eyebrow + título 24 + "Mostrar todos" | Título + link en sólo 2 secciones |
| Hero detalle | 356 px + h1 96 | Cover 160/208 + `Title hero` (mucho menor) |
| Tabla pistas | 56 px con columnas | Lista `SongItem` sin header ni columnas |
| Action bar | play 56 + shuffle + like + download + "…" + toggle | play + like/editar; sin shuffle/download/"…" |

## 2.4 Detalles

| Página | Hoy | Gap principal |
|---|---|---|
| Playlist | hero simple + lista (`playlists/[id]:83-154`) | Sin gradiente, sin shuffle/download, play-all sólo 20 items |
| Álbum | hero simple + lista | Sin like de álbum, sin play-all, sin "Más de {artista}" |
| Artista | hero con degradado **sin cover** (`artist/[id]:76-91`) | Falta banner con imagen, "Populares" con contador, Discografía con chips |
| Canción | hero sin cover (`song/[id]:51-112`) | Falta cover, like, "+", descarga |
| Tus canciones | lista infinita | Falta hero y columnas |
| Búsqueda | input + 2 secciones | Faltan tiles de género y chips |
| Ajustes | card de 3 filas | Falta agrupación y columna centrada |

## 2.5 Datos faltantes (backend)

| Necesidad | Estado | Acción |
|---|---|---|
| Ranking personal 7 días | No existe (sólo `/me/recently-played` sin orden por conteo) | **`GET /me/top-songs?days=7&limit=10`** |
| Filtrar por género | `/songs` no lo acepta (`songs/router.py:15-30`) | Añadir `genre` (JSONB `@>`) |
| Tiles de género | `GET /genres` existe | Ya disponible |
| Like de álbum | Endpoint + servicios existen, UI no | Usarlos |
| Saves de playlist | No existe contador | Opcional |
| Oyentes mensuales | No existe | Mostrar suma de `play_count` ("N reproducciones") |
| Discografía | `GET /albums?artist_id` | Ya disponible |

---

# PARTE 3 — Plan de implementación

> Mismos **patrones** de layout, no copia pixel-perfect. Se respetan los tokens
> de `globals.css` (paleta esmeralda OKLCH, Bricolage/Inter, radios y
> animaciones existentes). Nada de features que no existan en el backend.

## Fase 0 — Primitivas (sin cambio visual)

| # | Componente | Detalle |
|---|---|---|
| 0.1 | `MediaCard` | Atom: `shape` (square/circle), `size`, cover con fallback, play flotante, título/subtítulo, badge, slot de acciones. |
| 0.2 | `Carousel` | Scroll-snap horizontal, flechas 32 px al hover/focus, sin scrollbar, teclado. |
| 0.3 | `Section` | Eyebrow 12 + título 24/700 + "Ver todo" 16 + cuerpo `carousel|grid`. |
| 0.4 | `Chips` | 32 px, activo blanco/negro, sincronizado con URL. |
| 0.5 | `DetailHero` | Gradiente del cover, cover `clamp(128px, 20vw, 232px)`, h1 `clamp(2rem, 6vw, 6rem)`/800, meta slot. |
| 0.6 | `ActionBar` | Play 56, shuffle, like, download, "…", toggle lista/grid; sticky. |
| 0.7 | `TrackTable` | Columnas configurables (`#/Título/Álbum/Fecha/⏱`), filas 56, header sticky, acciones al hover, responsive. |
| 0.8 | `CollageCard` | Card 2-up de 456×593 con título tipográfico sobre la imagen + caption. |
| 0.9 | `PageHeader` | Título/subtítulo/acciones para páginas simples. |

Skeletons: `MediaCardSkeleton`, `TrackRowSkeleton`, `HeroSkeleton`, `TileSkeleton`.

## Fase 1 — Backend mínimo

1. **`GET /me/top-songs?days=7&limit=10`** en `apps/api` y `apps/api-worker`.
   - `COUNT(listens.id)` por canción, `WHERE user_id AND played_at >= now()-days`,
     `ORDER BY count DESC, max(played_at) DESC`.
   - Eager-load `Song.artist` + `Song.album`.
   - Tests: sin listens → `[]`; aislamiento entre usuarios; ventana.
2. **`genre` en `GET /songs`** validado contra `SongGenre`.
3. Regenerar `packages/api-types/generated.ts` + fixture `openapi-contract.json`.

## Fase 2 — Home

1. Header compacto + chips (`Todo · Canciones · Playlists · Álbumes`).
2. Shortcut grid (4 fijos + 2 contextos de `/me/recently-played`).
3. **Lo más escuchado por ti (7 días)** → si vacío, la misma sección muestra
   **Recién subidas**. Nunca las dos.
4. Seguí escuchando · Tus playlists · Álbumes que te gustan · Top de la semana ·
   Playlists de la comunidad · Top del mes (carruseles).
5. **Destacados** (collage 2-up): 2-3 system playlists o top de la semana.
6. Cada sección con `Suspense` + skeleton; primeras 4 cards `priority`.

## Fase 3 — Búsqueda

1. Estado vacío "Explorar todo" con tiles 2:1 desde `GET /genres`.
2. Chips `Todo · Canciones · Álbumes · Listas · Artistas`.
3. Resultado: card grande (104 px) + lista unificada (80 px) con badge de tipo.
4. Filtro por género real vía `?genre=`.

## Fase 4 — Detalles

1. Playlist: hero + action bar + `TrackTable` + play-all completo.
2. Álbum: hero + tabla sin columna Álbum + like + "Más de {artista}".
3. Tus canciones: hero + tabla con fecha de like + infinite scroll.
4. Artista: banner a sangre + "N reproducciones" + Populares (5) +
   Discografía con chips + Aparece en + similares.
5. Canción: hero con cover + like/"+"/descarga + letra.

## Fase 5 — Reproductor

1. Barra 3 zonas (info+like · transporte con seek · cola/volumen/fullscreen).
2. Móvil compacta + swipe up.
3. Panel "Sonando" con tabs Letra / Cola.

## Fase 6 — Biblioteca, ajustes y estados

1. `/catalog` con chips Listas/Artistas/Álbumes + búsqueda + orden.
2. `/settings` en columna centrada con grupos y toggles.
3. `not-found.tsx` branded + `error.tsx` alineado.
4. Skeletons y estados vacíos de todo lo nuevo.

## Esfuerzo

| Fase | Días | Riesgo |
|---|---|---|
| 0 | 2-3 | Bajo |
| 1 | 1-2 | Medio (contrato Worker) |
| 2 | 3-4 | Medio (LCP) |
| 3 | 2-3 | Bajo |
| 4 | 4-5 | Medio |
| 5 | 2-3 | Medio |
| 6 | 2 | Bajo |

## Lo que NO vamos a copiar

Premium/upsells, podcasts, audiolibros, radios y mixes automáticos, Canvas,
actividad de amigos, la app de escritorio y el layout mobile de Spotify Web
(no es responsive; el nuestro sí).

## Decisiones abiertas

1. ¿Saludo compacto o sin saludo como Spotify?
2. ¿Incluimos el shortcut grid en Fase 2?
3. ¿Incluimos el bloque **Destacados** (collage 2-up) usando system playlists?
4. ¿Reproductor completo o sólo prev/next + seek?
