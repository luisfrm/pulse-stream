# [ARCHIVADO] Referencia de layout - Spotify Web (es-ES) vs Pulse Stream

> ⚠️ **Este documento NO es la referencia.** Se generó antes de usar el MCP
> `browse` sobre el perfil autenticado: la captura base salió del navegador
> embebido (sin sesión) y varias medidas/observaciones quedaron imprecisas.
> La referencia válida es **`LAYOUT_AUTH_USER.md`** (MCP `browse` + perfil
> autenticado, medidas sobre el DOM).

> Documento de trabajo. Parte 1 = inventario de Spotify (medido en el navegador,
> sesión real, viewport 1920×951 y 390×844). Parte 2 = comparación con Pulse
> Stream. Parte 3 = plan de implementación por fases.
>
> La captura del home de referencia está en `docs/spotify-reference/home.png`.

---

## 1. Shell (estructura global)

Spotify Web es un **grid de 2 columnas + barra inferior**, con un panel derecho
opcional. Todo vive en un fondo `#000` que actúa de separador entre paneles.

```
┌──────────────────────────────────────────────────────────┐
│ top bar (full width, 64px)                                │
│  [logo]        [⌂] [ buscador ]              [perfil]      │
├───────────────┬──────────────────────────────────────────┤
│ sidebar       │  main (scroll independiente)             │
│ 368px / rail  │                                          │
│ (Tu biblioteca,│  chips                                   │
│  filtros,      │  hero (detalle)                          │
│  lista)        │  secciones / tabla                       │
├───────────────┴──────────────────────────────────────────┤
│ player bar (full width, 72px)                             │
└──────────────────────────────────────────────────────────┘
```

**Medidas observadas (1920 px de ancho):**

| Elemento | Medida |
|---|---|
| Top bar | 64 px de alto, fondo `bg-base` con el mismo negro que el body |
| Sidebar | 368 px (expandido) / 72 px (rail de iconos) / 420 px con biblioteca ampliada |
| Gap entre paneles | 8 px (fondo negro visible) |
| Player bar | 72 px |
| Padding horizontal del main | 24 px |
| Ancho de contenido | 1356 px (1920 − 368 − paddings) |
| Card de carrusel | 169 px de lado, gap 12–16 px, 6–7 visibles con "peek" |
| Radio de superficies | 8 px (paneles), 4–6 px (covers de card en fila), 500 px (pills) |

**Top bar**
- Izquierda: logo (icono de Spotify, 32 px) → link al home.
- Centro-izquierda: botón circular "Inicio" (48 px) + **buscador global** pill
  (480 px, fondo `bg-highlight`, icono lupa, placeholder "¿Qué quieres
  reproducir?", botón "borrar" cuando hay texto y botón de "biblioteca" a la
  derecha del input).
- Derecha (`solo desktop`): "Descubrir Premium" (pill blanca), "Instalar app",
  campana de novedades, actividad de amigos, avatar con inicial + badge de plan.
- El avatar abre un **menú**: Cuenta · Perfil · Recientes · Sube a Premium ·
  Asistencia · Descargar · Configuración · Cerrar sesión, y debajo un bloque
  "Tus avisos" embebido (no es una página aparte).

**Responsive**
- < 1024 px: el sidebar colapsa a **rail vertical de 72 px** (iconos + covers en
  miniatura). El mobile web conserva el rail; la app nativa usa bottom nav.
- Con el panel derecho abierto, el sidebar colapsa solo y el main se angosta.
- Mobile (390 px): top bar = logo + 2 botones circulares (Inicio, Buscar). No hay
  bottom nav en web.

**Sidebar "Tu biblioteca"**
- Header: "Tu biblioteca" + botón "Crear" (pill con +) + botón ampliar/contraer.
- **Chips de filtro**: Listas · Artistas · Álbumes (multi-selección; activo =
  fondo claro).
- Banner promocional descartable ("Importa tu música desde otras aplicaciones")
  — descartable y persistente.
- Buscador dentro de la biblioteca (sólo aparece al hacer hover/focus en el
  header: lupa + "Recientes" como criterio de orden).
- Lista de items: cover 48 px + título + subtítulo (`Lista • Spotify`,
  `Sencillo • ELENA ROSE`, `Artista`), fila activa con fondo `bg-highlight`,
  hover revela un botón play a la derecha.
- **Ampliar** convierte la lista en un **grid de cards** (6 columnas) con los
  mismos filtros y búsqueda, ocupando todo el ancho.

---

## 2. Home (`/`)

Estructura vertical, sin hero ni saludo:

```
1. Chips:            [Todo] [Música]
2. Shortcut grid:    2 columnas × hasta 4 filas (8 items) — tiles 64px
3. Carruseles:       sección tras sección
```

**1. Chips** — pill, activo = fondo blanco/texto negro, inactivo = fondo
`bg-highlight`/texto blanco. Filtran el tipo de contenido del home.

**2. Shortcut grid** — los "pins" del usuario: hasta 8 tiles.
- Tile: fila de 64 px de alto, cover 64×64 (`rounded-md`) + título en negrita,
  hover `bg-highlight`, botón play verde que aparece a la derecha en hover.
- En mobile se muestran 2 tiles por fila y el resto se scrollea horizontal.

**3. Carruseles** — el cuerpo del home. Orden observado en la cuenta usada:

| # | Sección | Contenido | Eyebrow/descripción | "Mostrar todos" |
|---|---|---|---|---|
| 1 | **Hecho para {nombre}** | mixes/playlists personalizadas (8) | eyebrow "Hecho para", título = nombre | sí |
| 2 | Tus mixes más escuchados | mixes (4) | — | sí |
| 3 | Recientes | contextos reproducidos (3) | — | sí |
| 4 | Tus listas | playlists propias (6) | — | sí |
| 5 | Álbumes con canciones que te gustan | álbumes (9) | — | sí |
| 6 | Emisoras recomendadas | radios (10) | descripción larga arriba del título | sí |
| 7 | Más como {artista} | mixes del artista (10) | eyebrow "Más como {artista}" | sí |
| 8 | Recomendada para hoy | álbumes (9) | descripción "Inspirada en tu actividad reciente" | sí |
| 9 | Tus artistas favoritos | artistas (10) | — | sí |
| 10 | Emisoras populares | radios (9) | — | sí |

Patrón de cada sección:
- **Header**: eyebrow (11–12 px, `text-subdued`) opcional, **título** (24 px,
  bold) y a la derecha **"Mostrar todos"** (14 px, `text-subdued`, hover
  subrayado) que navega a `/section/{id}`.
- **Cuerpo**: carrusel horizontal con scroll-snap; flechas circulares
  (`bg-highlight`, 32 px) que aparecen a los lados al hacer hover sobre la
  sección; sin barra de scroll visible.
- **Card**: cover cuadrado `rounded-md` con badge de fuente arriba-izquierda
  (logo de la app cuando aplica), **botón play verde 48 px** abajo-derecha que
  aparece con hover/focus, título (16 px bold, 1 línea con ellipsis) y subtítulo
  (14 px `text-subdued`, 2 líneas con clamp).
- Espaciado vertical entre secciones: **32–40 px**.

> Ojo: el home **no** tiene un `<h1>` visible ni saludo. El título "Inicio" es
> sólo para lectores de pantalla. El primer contenido es la fila de chips.

---

## 3. Búsqueda (`/search`)

**Estado vacío — "Explorar todo"**
- H2 "Explorar todo".
- Grid de **tiles de género**: 4 columnas desktop / 2 mobile, aspecto 2:1
  (`~200×100` px), color de fondo por género, título 24 px bold arriba-izquierda
  y cover rotada (-25°) abajo-derecha, borde redondeado 8 px, hover escala.
- Los tiles observados: Música, Eventos en directo, Especialmente para ti,
  Novedades, Spotify Sessions, Latina, Pop, Hip hop, Listas de éxitos, Rock,
  Cumbia, Dance y electrónica, Estado de ánimo, Descubrir, Fresh Finds, Indie…

**Con resultados (`/search/{query}`)**
1. **Chips**: Todo · Canciones · Álbumes · Listas · Artistas · Perfiles ·
   Géneros y estados de ánimo (en URL).
2. **"Resultados principales"** (tab Todo):
   - Card grande del mejor match (cover 92 px + eyebrow tipo + título 24 px +
     botón play 56 px + check de guardado) con fondo `bg-elevated` y hover.
   - Debajo, una **lista unificada con badge de tipo**: cada fila = thumb 56 px,
     título + subtítulo, columna derecha con la etiqueta `Artista` / `Álbum` /
     `Canción` / `Lista`, y acción contextual (pill "Siguiendo" para artistas,
     check verde si está guardado, "+" circular si no).
3. Al elegir un chip se muestran sólo resultados de ese tipo (grillas de cards o
   tabla de canciones según el tipo).

---

## 4. Detalle de playlist (`/playlist/{id}`)

```
┌ hero (340 px) ────────────────────────────────────────────┐
│ [cover 232px]  Lista pública                              │
│                Título gigante (hasta 96px, clamp)          │
│                descripción                                 │
│                [avatar] dueño · guardada N veces · 129     │
│                canciones · 7 h 30 min                      │
├ action bar (sticky, 72px) ──────────────────────────────── │
│ (▶ 56px) (shuffle) (check/+ ) (download) (...)   [Lista|⊞]│
├ tabla de canciones ─────────────────────────────────────── │
│ #  Título            Álbum        Fecha en la que se añadió ⏱│
│ 1  [art] Tití...     Un Verano...  3 mar 2026        4:03  │
└───────────────────────────────────────────────────────────┘
```

- **Fondo**: gradiente vertical derivado del color dominante del cover
  (cover → transparente sobre `#121212`). El hero no es una imagen de fondo: es
  cover + gradiente.
- **Eyebrow de tipo**: "Lista pública" / "Lista" / "Álbum" / "Artista" (11 px,
  mayúsculas suaves).
- **Título**: `clamp(2rem, 6vw, 6rem)`, `font-weight 900`, tracking negativo,
  `line-height 1`, `text-wrap: balance`.
- **Meta**: avatar 24 px + nombre del dueño en negrita, "guardada N veces",
  "N canciones", ", ", "X h Y min aproximadamente".
- **Action bar**: pegada bajo el hero (no sticky al hacer scroll hasta que pasa
  el hero, ahí queda fija), fondo con el mismo gradiente + blur.
  - Botón play: círculo verde 56 px con sombra.
  - Botones secundarios: 32 px, icono `text-subdued` → blanco en hover.
  - Derecha: toggle `Lista | ⊞` (tabla densa vs. cards).
- **Tabla**: header sticky (`#`, `Título`, `Álbum`, `Fecha en la que se añadió`,
  ⏱). Filas de 56 px; al hover la fila se resalta y el número se convierte en
  play, y aparece "…" al final. Check verde a la izquierda de la duración si la
  canción está en "Tus canciones".
- **Mobile**: el cover pasa a ser **imagen de fondo full-bleed** del hero con el
  texto encima; la tabla oculta las columnas Álbum y Fecha (sólo # / Título /
  duración).

---

## 5. Detalle de álbum (`/album/{id}`)

Idéntico a playlist con estas diferencias:
- Eyebrow "Álbum"; meta = avatar del artista + artista · año · N canciones · duración.
- Acciones: play, shuffle, "+" (guardar), download, "…".
- Tabla **sin columna Álbum** (sólo `#`, `Título`, ⏱); las pistas con varios
  artistas muestran el badge "E" (`explicit`).
- Debajo de la tabla: sección **"Más de {artista}"** (carrusel) y footer de
  copyright ("© año Label", "℗ año Label").

---

## 6. Detalle de artista (`/artist/{id}`)

```
┌ hero full-bleed (340px) ──────────────────────────────────┐
│  imagen del artista a sangre, degradado al fondo           │
│  Nombre gigante (alineado abajo-izquierda)                 │
│  [✓ Verificado/a por Spotify]  N M oyentes mensuales        │
├ action bar ─────────────────────────────────────────────── │
│ (▶ 56) (🪄) (shuffle) [Siguiendo] (...)                    │
├ Populares ──────────────────────────────────────────────── │
│ 1  [art] DtMF                         2.265.417.446   3:57 │
│ ... 5 filas, número + reproducciones + duración             │
├ Discografía ───────────────────────────────────────────── │
│ chips [Títulos populares] [Álbumes] [Sencillos]  carrusel   │
├ Incluye a {artista} · Información · Dónde se le puede ...   │
├ Sus fans también escuchan (carrusel de artistas)            │
└ Aparece en (carrusel)                                       │
```

- El hero usa **imagen a sangre** (no cover cuadrado) con `object-cover` y un
  degradado a `#121212` en la mitad inferior.
- "Populares": exactamente **5 filas**, con el contador de reproducciones a la
  derecha (formato `2.265.417.446`) y "See more" al final.
- "Discografía": carrusel con chips de tipo; card 2:1 si es álbum/single.
- "Información": bloque de texto + link "Leer más" (biografía).
- "Dónde se le puede descubrir": links externos con icono.
- "Sus fans también escuchan": grid de artistas circulares 160 px.

---

## 7. "Tus canciones" (`/collection/tracks`)

- Hero con cover generado (degradado violeta + corazón), eyebrow "Lista",
  título "Canciones que te gustan", meta **sin descripción**: `Luis Rivas ·
  299 canciones, 17 h aproximadamente`.
- Acciones: play, shuffle, **download** (no hay "+": es auto-guardado).
- Tabla: `#`, `Título`, `Álbum`, `Fecha en la que se añadió`, ⏱.
- El número de fila es la **fecha de like**, el orden por defecto es el más
  reciente agregado.

---

## 8. Reproductor

**Barra inferior (72 px)** — tres zonas:

| Zona | Contenido |
|---|---|
| Izquierda (30%) | cover 56 px + título + artista + ♥ + "…" (click abre "Sonando") |
| Centro (40%) | shuffle · anterior · **play 32 px** · siguiente · repetir, y debajo la barra de progreso con tiempos |
| Derecha (30%) | letra, cola, conectar dispositivo, volumen (slider), pantalla completa |

- Al hacer click en la zona izquierda se abre el **panel derecho "Sonando"**
  (cover grande, título, artista, acciones) con dos tabs: **Letra** y **Cola**.
- El botón de pantalla completa expande el mismo panel a un lienzo con cover
  grande centrada y la letra a la derecha.

---

## 9. Configuración (`/preferences`)

- Columna centrada, ancho máximo ~770 px, sin card: fondo plano.
- H1 "Configuración" + lupa para buscar ajustes.
- Grupos con H2 (Cuenta, Idioma, Calidad del audio, Tu biblioteca,
  Visualización, Vídeos y Canvas, Reproducción, Insights y actividad…) y filas
  `label` izquierda / control derecha.
- Controles: **toggles pill verdes** (56×32), selects nativos estilizados,
  botones outline pill ("Edición", "Importar biblioteca"), links con icono
  externo.

## 10. Estado 404

- Fondo negro, logo 88 px centrado, H1 "Página no encontrada" (32 px),
  subtítulo `text-subdued`, botón primario pill blanca "Inicio" y link "Ayuda".

---

## 11. Patrones transversales a reutilizar

1. **Card** única para todo (playlist, álbum, artista redondo, song): cover +
   play en hover + título + subtítulo + badge. Tamaño por `--card-size`.
2. **Carrusel** con `scroll-snap-type: x mandatory`, flechas al hover, sin
   scrollbar, foco por teclado.
3. **Header de sección**: eyebrow opcional + título 24 px + acción a la derecha.
4. **Hero de detalle** con gradiente desde el color del cover.
5. **Tabla de pistas** con header sticky y acciones por fila al hover, columna
   "#" que se vuelve play, columna duración fija a la derecha.
6. **Chips** para filtros, siempre sincronizadas con la URL.
7. **Skeletons** con la forma exacta del contenido (card, fila, hero).
8. **Transición** entre páginas: sin spinner de pantalla completa; el contenido
   entra con fade-up de 8 px.

---

# PARTE 2 — Comparación Spotify vs Pulse Stream

## 2.1 Shell

| Pieza | Spotify | Pulse Stream hoy | Gap |
|---|---|---|---|
| Top bar | Logo + Inicio + buscador global + avatar/menú | Top bar sólo móvil (logo + hamburguesa); en desktop no existe | **Falta top bar desktop** con buscador global |
| Sidebar | "Tu biblioteca": filtros, búsqueda interna, lista + modo grid ampliado | Nav de navegación por grupos (`dashboard-shell.tsx:38-110`) | El sidebar no es biblioteca; la biblioteca vive en `/catalog` |
| Panel derecho | "Sonando" (letra/cola) | No existe | Gap de reproductor |
| Player bar | 3 zonas: info+like, transporte completo con seek, volumen/cola/fullscreen | 1 zona: cover+título+play+chevron (`player-bar.tsx:27-104`); sin next/prev/seek/volumen/like | **Gap funcional grande** |
| Bottom nav | No (app nativa) | Sí, móvil (`bottom-nav.tsx`) | A favor: mejor en móvil que el web de Spotify |

## 2.2 Home

| Spotify | Pulse Stream hoy | Propuesta |
|---|---|---|
| Chips Todo/Música | — | Chips de filtro (ver 3.1) |
| Shortcut grid (hasta 8 tiles) | — | Grid de accesos: Tus canciones · Recientes · Tus playlists · Tus descargas (+ hasta 4 contextos recientes) |
| **Hecho para {nombre}** (mixes) | — | **"Lo más escuchado por ti" (7 días)** con fallback **"Recién subidas"** (nunca las dos) |
| Tus mixes más escuchados | — | No aplica (no hay mixes) |
| Recientes | "Seguí escuchando" en grid de 5 (`dashboard/page.tsx:65-92`) | Igual contenido, **en carrusel** |
| Tus listas | — | "Tus playlists" carrusel + tile "Crear playlist" |
| Álbumes con canciones que te gustan | — | "Álbumes que te gustan" carrusel (`GET /me/favorites/albums`, hoy sin uso visual) |
| Emisoras recomendadas / populares | — | No aplica (no hay radios) |
| Recomendada para hoy | "Recién agregadas" grid (`:94-127`) | "Recién subidas" carrusel |
| Tus artistas favoritos | — | Fase 2: artistas derivados de tus favoritos |
| — | "Más escuchadas esta semana" (`:129-156`) | "Top de la semana" carrusel |
| — | "Más escuchadas este mes" (`:158-185`) | "Top del mes" carrusel |
| — | "Playlists de la comunidad" (`:187-220`) | Carrusel |

**Header del home**: Spotify no tiene saludo ni `<h1>` visible. Pulse Stream tiene `"{saludo}, {nombre}"` + subtítulo (`dashboard/page.tsx:30-37`).
→ Propuesta: conservar el saludo pero compacto (título 28-32 px, sin subtítulo largo) y poner los chips inmediatamente debajo.

## 2.3 Tarjetas y secciones

| Patrón | Spotify | Pulse Stream hoy |
|---|---|---|
| Card única | Sí (cover + play hover + título + subtítulo + badge) | 3 componentes distintos: `SongCard`, `AlbumCard`, `PlaylistCard` (sin play en álbum/playlist) |
| Carrusel | Sí, scroll-snap + flechas | **No hay carrusel**: todo es grid `2/3/5` |
| Header de sección | eyebrow opcional + título 24 px + "Mostrar todos" | Título + link "Ver todo" en 2 secciones (`:76-83`, `:107-112`) |
| Play en card | Todas las cards (incluye álbum y playlist) | Sólo `SongCard` |
| Acciones en card | like/… en hover | like/"+" fijos arriba (sólo canciones) |

## 2.4 Detalle (playlist / álbum / artista / canción)

| Pieza | Spotify | Pulse Stream hoy |
|---|---|---|
| Hero playlist | cover 232 px + eyebrow + título gigante + descripción + meta + gradiente del cover | cover 160/208 + badges + `h1` + descripción + "N canciones · @autor" (`playlists/[id]/page.tsx:83-154`) — **sin gradiente ni escala tipográfica** |
| Título | `clamp(2rem, 6vw, 6rem)` peso 900 | `Title size="hero"` (menor) |
| Action bar | play 56 + shuffle + like + download + "…" + toggle lista/grid | play + like (solo system) + editar/borrar; **sin shuffle, sin download, sin "…"** |
| Tabla de pistas | `# · Título · Álbum · Fecha · ⏱` con header sticky y hover | lista `SongItem` (cover 44 + play + título/artista + badges + acciones) — sin columnas ni header |
| Play-all | Toda la playlist | Sólo la primera página de 20 |
| Álbum | hero + tabla + "Más de {artista}" + copyright | hero simple + lista; **sin like de álbum, sin play-all, sin relacionadas** |
| Artista | banner a sangre + verificado + oyentes + Populares (5) + Discografía + Aparece en + similares | hero con `bg-brand-gradient` **sin cover** + canciones + colaboraciones + álbumes (`artist/[id]/page.tsx:76-91`) |
| Canción | (no existe página de canción en Spotify) | hero + géneros + plays + letra; **sin cover** (`song/[id]/page.tsx:51-112`) |
| Tus canciones | hero + tabla con álbum y fecha | lista infinita sin hero (`catalog/songs`) |

## 2.5 Búsqueda

| Pieza | Spotify | Pulse Stream hoy |
|---|---|---|
| Estado vacío | **"Explorar todo"** con tiles de género 2:1 de colores | Texto "Escribí algo para empezar a buscar." (`search/page.tsx:50-52`) |
| Chips de tipo | Todo · Canciones · Álbumes · Listas · Artistas | — |
| Resultados | Top result + lista unificada con badge de tipo | Secciones "Canciones" (grid) + "Artistas" (filas) |
| Filtro por género | Tiles + páginas de género | **La API no filtra por género** (`songs/router.py:15-30`) |

## 2.6 Biblioteca y configuración

| Pieza | Spotify | Pulse Stream hoy |
|---|---|---|
| Biblioteca | sidebar con chips Listas/Artistas/Álbumes + búsqueda + orden | `/catalog` con búsqueda local + 3 secciones (`catalog/page.tsx`) |
| Ajustes | columna centrada 770 px, grupos con toggles | card con 3 filas (`settings/page.tsx:36-75`) |
| 404 | logo grande + título + CTA | `error.tsx` sin `not-found.tsx` propio |

## 2.7 Datos que faltan para igualar el layout

| Necesidad | Hoy | Acción |
|---|---|---|
| "Lo más escuchado por ti (7 días)" | No existe ranking por usuario; sólo historial sin ordenar por conteo (`listens/router.py:22-40`) | **Endpoint nuevo** `GET /me/top-songs?days=7&limit=10` |
| Tiles de género funcionales | `GET /genres` lista géneros, pero `/songs` no filtra por género | **Nuevo query param** `genre` en `GET /songs` |
| "Tus playlists" con portada | `PlaylistRead.cover_url` puede ser null | Mosaico 2×2 con covers de las 4 primeras canciones (sólo front) |
| "Guardada N veces" | `PlaylistRead` no trae `saves_count` | Opcional: contar en `user_favorite_playlists` |
| "Oyentes mensuales" del artista | No existe | Usar suma de `play_count` de sus canciones ("N reproducciones") |
| Artistas favoritos | No hay endpoint | Derivar en front desde `GET /me/favorites` (Fase 2) o nuevo `/me/top-artists` |
| Discografía del artista | `GET /albums?artist_id` existe | Ya disponible |

---

# PARTE 3 — Plan de implementación

> Criterio: **mismos patrones de layout**, no copia pixel-perfect. Se respetan los
> tokens de Pulse Stream (`globals.css`), Bricolage/Inter y la paleta esmeralda.
> Nada de features inventadas: cada sección debe tener datos reales.

## Fase 0 — Primitivas de layout (1 PR, sin cambio visible)

| # | Componente | Archivo | Detalle |
|---|---|---|---|
| 0.1 | `MediaCard` | `components/media-card.tsx` | Atom único: `shape="square|circle"`, `size="sm|md|lg"`, cover con `cover_url` o fallback gradiente/inicial, botón play flotante (hover/focus, siempre en touch), `title`, `subtitle`, `href`, `badge`, `actions` (slot). Reemplaza el layout interno de `SongCard`/`AlbumCard`/`PlaylistCard`. |
| 0.2 | `Carousel` | `components/carousel.tsx` | `scroll-snap-type: x mandatory`, `overscroll-behavior-x: contain`, flechas 32 px que aparecen en hover/focus, `aria-label`, teclado, sin scrollbar, `children` con `min-w`. |
| 0.3 | `Section` | `components/section.tsx` | `eyebrow?`, `title`, `description?`, `href`+`actionLabel` ("Ver todo"), `children`; variantes `carousel`/`grid`; spacing 32-40 px. |
| 0.4 | `Chips` | `components/chips.tsx` | Pills URL-synced (`?tipo=`), activo blanco/texto negro, scroll horizontal en móvil. |
| 0.5 | `DetailHero` | `components/detail-hero.tsx` | Gradiente desde el color del cover (canvas o color promedio server-side), cover `clamp(128px, 20vw, 232px)`, eyebrow, título `clamp(2rem,6vw,5rem)`, meta slot, description. |
| 0.6 | `ActionBar` | `components/action-bar.tsx` | Play 56 px, shuffle, like (slot), download, "…" (slot), toggle lista/grid. Sticky bajo el hero. |
| 0.7 | `TrackTable` | `components/track-table.tsx` | Header sticky (`#`, Título, Álbum?, Fecha?, ⏱), filas 56 px, número→play en hover, acciones al hover, `columns` configurable, responsive (oculta Álbum/Fecha en móvil). |
| 0.8 | `PageHeader` | `components/page-header.tsx` | Título + subtítulo + acciones para páginas simples. |

**Salida**: primitivas con skeleton propio (`MediaCardSkeleton`, `TrackRowSkeleton`) y tests de render (Vitest + RTL).

## Fase 1 — Backend mínimo para el home nuevo (1 PR)

1. **`GET /me/top-songs`** (apps/api + apps/api-worker)
   - Query: `days=7` (1-365), `limit=10` (1-50).
   - Devuelve `list[SongWithPlays]` (o `Page`) ordenado por plays del usuario en la ventana.
   - `repository`: `COUNT(listens.id)` agrupado por canción, `WHERE user_id = :u AND played_at >= now() - days`, `ORDER BY count DESC, last_played DESC`.
   - Eager-load `Song.artist` + `Song.album` (regla de `SongRead`).
   - Tests de integración: usuario sin listens → `[]`; dos usuarios no se mezclan; ventana respetada.
2. **`genre` en `GET /songs`** (`?genre=rock`): `WHERE songs.genres @> '["rock"]'::jsonb`, validado contra `SongGenre`.
3. Regenerar `packages/api-types/src/generated.ts` (`pnpm gen:types` + `gen:types:worker`) y el fixture `openapi-contract.json` del Worker.

## Fase 2 — Home nuevo (1-2 PR)

Estructura final (orden acordado):

1. **Header compacto** (saludo + chips).
2. **Chips**: `Todo · Canciones · Playlists · Álbumes` (filtran las secciones del home; estado en URL).
3. **Shortcut grid** (hasta 6): Tus canciones (`/catalog/songs`) · Recientes · Tus playlists · Tus descargas + hasta 2 contextos recientes (álbum/playlist) desde `/me/recently-played`.
4. **Lo más escuchado por ti** — `GET /me/top-songs?days=7&limit=10`.
   - Si `items.length === 0` → **la misma sección** muestra **"Recién subidas"** (`GET /songs`), **nunca las dos**.
   - Copy: "Tus 7 días en loop" / fallback "Lo último que llegó al catálogo".
5. **Seguí escuchando** (carrusel, `/me/recently-played`).
6. **Tus playlists** (carrusel + tile "Crear playlist").
7. **Álbumes que te gustan** (`/me/favorites/albums`).
8. **Top de la semana** (`/songs/popular?days=7`).
9. **Playlists de la comunidad** (`/playlists/public`).
10. **Top del mes** (`/songs/popular?month=true`).

Reglas:
- Cada sección = `<Section>` con `Suspense` propio y `SectionGridSkeleton`.
- Secciones vacías se omiten (nunca bloque vacío), salvo la #4 que tiene fallback.
- Carrusel: 2.2 cards visibles en móvil, 5-6 en desktop.
- Sin regresión de LCP: primeras 4 cards `priority`.

## Fase 3 — Búsqueda con géneros (1 PR)

1. `/search` sin query → **"Explorar todo"**: grid 2/4 columnas de tiles 2:1
   (`components/genre-tile.tsx`) con los géneros de `GET /genres`, color
   derivado del índice (paleta de 8 combinaciones sobre `--color-brand-*`).
2. Click en tile → `/search?genero=rock` con chips:
   `Todo · Canciones · Álbumes · Listas · Artistas`.
3. Resultados "Todo": top result + lista unificada con **badge de tipo**
   (`components/result-row.tsx`), reusando `TrackTable` para canciones.
4. Mantener `SearchInput` con debounce y estado en URL.

## Fase 4 — Detalles estilo Spotify (2 PR)

1. **Playlist** (`/playlists/[id]`): `DetailHero` + `ActionBar` (play, shuffle,
   like si system, download de la playlist, "…", toggle lista/grid) +
   `TrackTable` (`#`, Título, Álbum, Fecha, ⏱) + play-all con la playlist
   completa (fetch de todas las páginas o endpoint sin límite de 20).
2. **Álbum** (`/album/[id]`): mismo hero; `TrackTable` sin columna Álbum; like
   de álbum (los servicios `addFavoriteAlbum`/`removeFavoriteAlbum` ya existen);
   sección "Más de {artista}".
3. **Tus canciones** (`/catalog/songs`): hero violeta + `TrackTable` con fecha de
   like, infinite scroll conservado.
4. **Artista** (`/artist/[id]`): hero con **cover del artista a sangre** (hoy no
   se muestra), `N reproducciones` (suma de plays), `Populares` (top 5 con
   contador), `Discografía` (carrusel con chips Álbumes/Sencillos),
   `Aparece en` (colaboraciones), `Fans también escuchan` (Fase 5).
5. ~~**Canción** (`/song/[id]`): hero con cover del álbum + like/"+"/download
   (hoy faltan) + letra.~~ **Removido**: la ruta ya no existe; las canciones
   reproducen al tocar cover/título y `/song/*` cae en el 404 branded.

## Fase 5 — Reproductor (1 PR)

1. Barra de 3 zonas en desktop: info (cover + título/artista + like + "…") ·
   transporte (**shuffle, prev, play, next, repeat** + seek con tiempos) ·
   cola/volumen/fullscreen.
2. Móvil: barra compacta actual + swipe up al fullscreen.
3. Panel derecho "Sonando" con tabs **Letra / Cola** (reusa `PlayerFullscreen`).
4. `player-provider` ya expone `next/prev/seek`; sólo falta UI.

## Fase 6 — Biblioteca, ajustes y estados (1 PR)

1. `/catalog` → biblioteca con chips `Listas · Artistas · Álbumes`, búsqueda y
   orden por reciente; modo grid/lista.
2. `/settings`: columna centrada, grupos y filas con `label`/control (toggles
   para cache offline y preferencias ya existentes).
3. `not-found.tsx` branded (logo + título + CTA) y `error.tsx` alineado.
4. Skeleton de todas las secciones nuevas.

## Orden sugerido y esfuerzo

| Fase | Alcance | Esfuerzo | Riesgo |
|---|---|---|---|
| 0 | Primitivas | 2-3 días | Bajo (sin cambio visual) |
| 1 | `top-songs` + `genre` + tipos | 1-2 días | Medio (contrato Worker) |
| 2 | Home | 3-4 días | Medio (LCP) |
| 3 | Búsqueda | 2-3 días | Bajo |
| 4 | Detalles | 4-5 días | Medio |
| 5 | Reproductor | 2-3 días | Medio |
| 6 | Biblioteca/ajustes | 2 días | Bajo |

## Decisiones abiertas (necesito tu OK)

1. **Saludo del home**: ¿lo mantenemos compacto o lo eliminamos como Spotify
   (que arranca directo con chips)?
2. **Chips del home**: ¿`Todo · Canciones · Playlists · Álbumes` (filtran
   secciones) o sólo `Todo · Novedades` y dejamos el home entero?
3. **Shortcut grid**: ¿lo incluimos en Fase 2 o lo dejamos para después (es
   "nice to have" y depende de pins del usuario)?
4. **Playlists con mosaico 2×2** cuando no tienen cover propia: ¿sí?
5. **Alcance del reproductor** (Fase 5): ¿completo (prev/next/seek/volumen/cola)
   o sólo prev/next + seek?
