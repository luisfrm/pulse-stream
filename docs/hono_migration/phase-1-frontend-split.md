# Fase 1 — Split del frontend: `apps/web` (app) + `apps/panel` (panel)

**Objetivo:** separar físicamente la app y el panel, extrayendo lo compartido a
`packages/*`, **sin cambiar el comportamiento ni las APIs**. Al terminar, la app
y el panel siguen apuntando a Python local; el cutover a Hono es la Fase 4.

## Tests primero

- Mover/añadir tests existentes sin perder cobertura:
  - `packages/shared`: `format.test.ts`.
  - `packages/api-client`: test del factory/ofetch y `uploadToR2`.
  - `apps/web`: `playlist-picker.test.tsx`, `song-card.test.tsx`,
    `bottom-nav.test.tsx`, `cover-uploader.test.tsx`, `offline.test.ts`.
  - `apps/panel`: test de `songs-service`/`albums-service` admin (mock de
    `panelApi`), `ZipImport` (render + estados), `login` (submit).
- Comando de verificación: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Paquetes compartidos

| Paquete | Contenido | Notas |
|---|---|---|
| `packages/ui` | `components/ui/*` (Button, Badge, Card, Input, Textarea, Title, Select, BottomSheet, Dialog/Modal, Skeleton, Checkbox), `cn`, `BrandLogo`, `AuthBackground`, `FullScreenLoader` | `cva` + `tailwind-merge` + Radix |
| `packages/design` | `tokens.css` con `@theme`, base/reduced-motion, `fonts.ts` | Tailwind v4 |
| `packages/api-client` | `createApiClient({baseURL})`, `ApiFetchOptions`, `Page<T>`, `friendlyError`, `uploadToR2` | Isomórfico (cookies server-side) |
| `packages/shared` | `formatGenre`, `formatRole`, fechas, helpers | Sin React |
| `packages/api-types` | Tipos generados de Python (panel) | Ya existe |
| `packages/app-api-types` | Tipos generados de Hono (app) | Se crea en Fase 2 |

## Movimientos

### `apps/panel`

- Rutas: mover `app/(panel)/panel/*` a `apps/panel/app/panel/*`; `app/(panel)/layout.tsx`
  → `apps/panel/app/panel/layout.tsx`; `error.tsx`, `loading.tsx` propios.
- Login: `apps/panel/app/login/page.tsx` (email/password, formulario actual).
- `proxy.ts`: protege `/panel/*`, chequea `panel_session`.
- `session-service.ts`: `panelApi('/users/me')`.
- `lib/services`: `auth` (login/logout), catálogo admin (`songs/albums/artists`),
  uploads, playlists system, admin users, genres.
- Componentes: `PanelShell`, formularios de song/album/artist, `CoverUploader`
  admin, `AudioPreviewPlayer`, `ZipImport`, `PlaylistManager`.
- Sin `PlayerProvider`, sin PWA/SW, sin Analytics, sin `BottomNav`.
- `force-dynamic` en páginas con datos.
- `PANEL_SESSION_COOKIE` (default `panel_session`) y `NEXT_PUBLIC_API_URL=http://localhost:8000`.

### `apps/web`

- Se queda con `(public)`, `(protected)`, player, PWA, dashboard shell, bottom nav,
  catálogo, favoritos, playlists de usuario, reciently-played, account, settings.
- Se elimina `(panel)` y el link "Panel admin" de sidebar/bottom nav.
- Login/register: por ahora los formularios actuales (el cambio a password-only
  es Fase 4); `proxy.ts` deja de matchear `/panel`.
- `lib/services`: lecturas de catálogo, favoritos, playlists, listens, auth,
  uploads (solo presign de cover).
- `CoverUploader`: recibe `presign`/`persist` por props para compartirse.

## Reglas de Tailwind v4 / Next

- `packages/design/tokens.css` es el único lugar de tokens.
- Cada `globals.css`:
  ```css
  @import "tailwindcss";
  @import "@pulse-stream/design/tokens.css";
  @source "../../../packages/ui/src";
  ```
- `next.config.ts`: `transpilePackages: ["@pulse-stream/ui", "@pulse-stream/design",
  "@pulse-stream/api-client", "@pulse-stream/shared"]`.
- `next/font` en cada app (o `fonts.ts` compartido); las variables CSS las
  consumen los tokens.
- No `overflow-x: clip` en `html` (rompe el scroll lock de los modales).

## Variables de entorno

| App | Variable | Valor local |
|---|---|---|
| web | `NEXT_PUBLIC_API_URL` | `http://localhost:8000` (hasta Fase 4) |
| web | `COOKIE_DOMAIN` | vacío |
| web | `SESSION_COOKIE` | `session` |
| panel | `NEXT_PUBLIC_API_URL` | `http://localhost:8000` |
| panel | `PANEL_SESSION_COOKIE` | `panel_session` |
| panel | `DATABASE_ENV` | `dev` / `prod` (banner) |

Durante la transición, si la app y el panel corren juntos contra Python, usar dos
procesos (`SESSION_COOKIE_NAME=session` y `SESSION_COOKIE_NAME=panel_session`) o
aceptar la cookie compartida en localhost.

## Mapa de acoplamientos (inventario)

- **Panel → app**: único import real `components/audio-preview-player.tsx` →
  `components/player/audio-orchestrator`. Mover el orquestador a
  `packages/shared` (TS puro) o duplicarlo; cada app tiene su instancia.
- **Links cruzados**: `PanelShell` linkea `/account`; `PlaylistsManager` linkea
  `/playlists/{id}`; `DashboardShell`/`BottomNav` linkean `/panel`. Eliminar los
  links al panel desde la app y decidir si el panel muestra links a la app.
- **Servicios mezclados**: `songs`, `albums`, `artists`, `playlists`, `uploads`.
  Separar por audiencia; no mover archivos enteros a un paquete compartido o el
  web arrastra métodos admin.
- **Cookie forwarding**: `lib/api/client.ts` reenvía **todas** las cookies. El
  cliente debe seleccionar `SESSION_COOKIE` / `PANEL_SESSION_COOKIE`.
- **LogoutButton**: hardcodea `/api/logout`; recibir la acción por prop o
  resolverla por app.
- **Server Actions inline** en páginas del panel y de la app: no se pueden mover
  a paquetes; se recrean en cada app.
- **PWA/SW**: `public/sw.js` y `PwaRegister` solo en la app; el panel no debe
  registrar el SW. `@vercel/analytics` y `PlayerProvider` solo en el root layout
  de la app.
- **UI kit**: `modal.tsx` importa `@/lib/hooks/use-is-mobile`; mover el hook al
  paquete. `FullScreenLoader`/`AudioPreviewPlayer` usan `bg-blooms`, `eq-bar`,
  `card-lift` y keyframes globales: moverlos a `packages/design` o el panel
  pierde estilos.
- **Assets**: `BrandLogo` usa `/logo-round.webp`; copiarlo a `apps/panel/public`.
- **Tests**: `uploads-service.test.ts` mockea `@/lib/api/client`; al pasar a
  factory hay que adaptarlo. Faltan tests del panel (servicios admin, ZIP,
  login) antes de mover.

## Orden de extracción (del inventario)

1. **Baseline**: `pnpm typecheck && lint && test && build`; snapshot del estado.
2. **`packages/shared`**: `format.ts` + test, `error.ts`, `CACHE_TAGS`, `Page<T>`,
   `audio-orchestrator.ts`.
3. **`packages/design`**: `tokens.css` (`@theme`, keyframes, `bg-blooms`,
   `card-lift`, `eq-bar`, reduced-motion, body/inputs/scrollbars), `fonts.ts`.
4. **`packages/ui`**: `components/ui/*`, `BrandLogo`, `AuthBackground`,
   `FullScreenLoader`, `use-is-mobile`, `FileInput`, `Sonner`; partir
   `loading-skeletons` (app vs panel).
5. **`packages/api-client`**: `createApiClient({baseURL, cookieName})`,
   `ApiFetchOptions`, `Page<T>`, `uploadToR2`, `COVER_CACHE_CONTROL`.
6. **Servicios separados**: catálogo (lecturas), library (app), admin (panel),
   playlists públicas compartidas. `session-service` parametrizado por cookie.
7. **`apps/panel`**: scaffold, layout lean, login, logout, mover `git mv` las
   rutas `(panel)` → `app/panel/*`, `PanelShell`, `AudioPreviewPlayer`.
8. **Limpiar `apps/web`**: borrar `(panel)`, servicios admin, links `/panel`,
   matcher del proxy; mover `CreatePlaylistForm` fuera de `app/`.
9. **Cierre**: env por app, tests, CI/turbo, `AGENTS.md`, smoke Playwright.

## Verificación

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter @pulse-stream/web dev    # :3000
pnpm --filter @pulse-stream/panel dev  # :3001
```

Playwright (si está disponible): login en cada app, navegación al catálogo/panel,
y verificar que el panel no existe en la app y viceversa.

## Criterios de cierre

- [ ] `apps/web` no contiene rutas ni componentes de panel.
- [ ] `apps/panel` levanta en :3001 y hace login contra Python.
- [ ] No hay imports cruzados entre apps; solo `packages/*`.
- [ ] Builds y tests de ambas apps verdes.
- [ ] Player/PWA siguen funcionando en la app.
- [ ] UI idéntica (tokens compartidos, sin paletas paralelas).
- [ ] `AGENTS.md` actualizado con la nueva estructura.
