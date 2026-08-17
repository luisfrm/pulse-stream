# Plan de Implementación — Spotify Clone (Monorepo)

> Stack: pnpm workspaces · Next.js 16 · FastAPI (uv) · SQLAlchemy 2.0 async · Neon (Postgres serverless) · Cloudflare R2 · Tailwind v4 · PWA

---

## 0. Respuestas rápidas a tus preguntas

| Pregunta | Respuesta corta |
|---|---|
| ¿Equivalente a Better Auth en Python con cookies? | **`fastapi-users`** — es la librería más parecida en filosofía (auth "batteries included", cookie transport nativo). Sección 3. |
| ¿La arquitectura Router→Service→Repository→Models es "estándar" en Python? | FastAPI **no la impone** (es un framework sin opinión), pero es el patrón **de facto recomendado** en la comunidad para proyectos medianos/grandes en 2026. Sección 5. |
| ¿Qué arquitectura obliga NestJS? | Sí obliga una: Modules/Controllers/Providers con inyección de dependencias tipo Angular. Sección 6 (referencia, ya que el monorepo final es solo Python + Next). |
| ¿Enums en Pydantic o en Postgres? | Enums/Literal **solo en Pydantic** (capa de validación), columnas en DB como `VARCHAR`/`TEXT`. Igual que pediste. Sección 4. |

---

## 1. Estructura del monorepo

```
spotify-clone/
├── apps/
│   ├── web/                      # Next.js 16
│   └── api/                      # FastAPI + uv
├── packages/
│   ├── api-types/                 # Tipos TS generados desde el OpenAPI de FastAPI
│   └── config/                    # eslint/prettier/tsconfig compartidos
├── pnpm-workspace.yaml
├── package.json
└── turbo.json                     # opcional, para cachear builds (Turborepo)
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Nota clave sobre `packages/api-types`:** como pediste no repetir validaciones (Zod en el front, Pydantic en el back), la forma correcta de mantenerlos sincronizados **sin duplicar a mano** es generar el cliente/tipos TypeScript automáticamente desde el OpenAPI schema que FastAPI ya expone gratis en `/openapi.json`, usando `openapi-typescript` u `orval`. Esto va en un script `pnpm gen:types` que corre en CI y en pre-commit. Zod se sigue usando en el front para validar formularios en runtime, pero los *tipos* vienen del backend, no se re-declaran a mano.

---

## 2. Backend — Python + FastAPI + uv

### 2.1 Stack recomendado

| Pieza | Elección | Por qué |
|---|---|---|
| Package manager | **uv** | Ya decidido. Resuelve y instala ~10-100x más rápido que pip/poetry, `uv.lock` reproducible. |
| ORM | **SQLAlchemy 2.0 (async) + Alembic** | Es el ORM que mejor soporta Neon: driver `asyncpg` async nativo, control total sobre el pool de conexiones (crítico en serverless), y Alembic para migraciones versionadas. SQLModel (Pydantic+SQLAlchemy combinados) es tentador pero limita el control fino del ORM a medida que el proyecto crece; para un proyecto de este tamaño SQLAlchemy puro + Pydantic separado da más flexibilidad a largo plazo. |
| Validación | **Pydantic v2** | Ya viene integrado en FastAPI, es el "Zod de Python". Los `schemas.py` de cada módulo son el equivalente exacto a tus schemas Zod. |
| Auth | **fastapi-users** | Ver sección 3. |
| Migraciones | **Alembic** | Estándar de facto con SQLAlchemy. |
| Storage | **boto3** (cliente S3 apuntando al endpoint de R2) | R2 es S3-compatible; boto3 genera presigned URLs sin problema (`region_name="auto"`, `endpoint_url=https://<account_id>.r2.cloudflarestorage.com`). |
| Rate limiting | **slowapi** | Middleware simple basado en `limits`, protege login/registro/presign contra abuso. |
| Logging/observabilidad | **structlog** + Sentry (opcional) | Logs estructurados en JSON, fáciles de consumir en cualquier plataforma de logs. |
| Testing | **pytest + pytest-asyncio + httpx.AsyncClient** | Ver sección 7. |

### 2.2 Conexión a Neon — detalle importante

Neon expone dos connection strings: **pooled** (con `-pooler` en el host, pasa por PgBouncer) y **direct**. Regla práctica:

- **La app (FastAPI) usa siempre la conexión *pooled*** para las queries normales.
- **Alembic (migraciones) usa la conexión *direct***, porque PgBouncer en modo *transaction pooling* rompe features de sesión que Alembic a veces necesita (`SET`, locks de sesión larga).
- Si despliegas FastAPI como **proceso persistente** (Railway/Fly/Render — recomendado, ver sección 8), usa `AsyncEngine` normal con `pool_pre_ping=True` para descartar conexiones "stale" si Neon escala a cero.
- Si en algún punto despliegas FastAPI **como funciones serverless**, cambia a `NullPool` y deja que PgBouncer haga el pooling real.

```python
# db/session.py
engine = create_async_engine(
    settings.DATABASE_URL,  # pooled, con -pooler
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)
```

---

## 3. Auth — equivalente a Better Auth en Python, solo cookies

**Recomendación: [`fastapi-users`](https://fastapi-users.github.io/fastapi-users/)** con SQLAlchemy adapter.

Por qué es el equivalente más cercano a Better Auth:
- Maneja registro, login/logout, reset de password, verificación de email y gestión de usuarios "de fábrica" (igual que Better Auth), en vez de que tengas que escribir JWT a mano.
- Tiene un **`CookieTransport`** nativo — exactamente lo que pediste (solo cookies, sin exponer tokens en `localStorage` ni en el body de la respuesta):

```python
# core/config.py
from enum import Enum
from typing import Literal
from pydantic_settings import BaseSettings

class Environment(str, Enum):
    LOCAL = "local"   # valor por defecto si la env var ENV no está seteada
    DEV = "dev"
    PROD = "prod"

class Settings(BaseSettings):
    env: Environment = Environment.LOCAL   # lee la env var "ENV"; si no existe -> local
    auth_secret: str
    database_url: str
    # dominios propios permitidos, ver 3.2
    cors_origin_regex: str = r"https://([a-zA-Z0-9-]+\.)?tudominio\.com|http://localhost:\d+"

    @property
    def is_local(self) -> bool:
        return self.env == Environment.LOCAL

    @property
    def cookie_secure(self) -> bool:
        # SameSite=None exige Secure=True por spec del navegador;
        # en local casi siempre corres sobre http plano.
        return not self.is_local

    @property
    def cookie_samesite(self) -> Literal["lax", "none"]:
        # local: front y back comparten "site" (localhost:puerto) -> lax basta
        # dev/prod: dominios distintos, acceso cross-site real -> none
        return "lax" if self.is_local else "none"

settings = Settings()
```

```python
# features/auth/backend.py
from fastapi_users.authentication import CookieTransport, AuthenticationBackend, JWTStrategy
from app.core.config import settings

cookie_transport = CookieTransport(
    cookie_name="session",
    cookie_max_age=60 * 60 * 24 * 7,       # 7 días
    cookie_secure=settings.cookie_secure,   # True salvo en local
    cookie_httponly=True,                   # obligatorio, no accesible por JS
    cookie_samesite=settings.cookie_samesite,
)

def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=settings.auth_secret, lifetime_seconds=60 * 60 * 24 * 7)

auth_backend = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)
```

- Password hashing con **Argon2** (vía `passlib`), ya integrado.
- Extensible para roles (`is_superuser`, o un campo `role` custom para tu panel de admin).

### 3.1 Variable `ENV` y detección local

Tal como pediste: una sola env var `ENV` con enum `dev | prod`; si no está seteada (ausente en `.env` o en las variables de entorno del hosting), el default es `local`. De ahí sale la propiedad `is_local` que se usa para: (a) decidir si las cookies llevan `Secure`, (b) decidir el `SameSite`, y (c) cualquier otro comportamiento condicional (ej. logs más verbosos, docs de Swagger habilitadas, etc.) — todo centralizado en `Settings`, nunca `if os.getenv(...)` regado por el código.

### 3.2 Cookies "desde cualquier sitio" — lo que sí y lo que no es posible

Una aclaración importante antes del código: por spec, **no puedes combinar `credentials` (cookies) con `Access-Control-Allow-Origin: *`** — el navegador lo bloquea directamente, porque si cualquier página pudiera leer/enviar tu cookie de sesión, cualquier sitio malicioso podría actuar en nombre del usuario logueado. Es una limitación del navegador, no de FastAPI.

Lo más cercano y seguro a "cualquier sitio" es un **allow-list dinámico por regex** — cualquier subdominio tuyo, más `localhost` en cualquier puerto para desarrollo — combinado con `SameSite=None` (que sí permite cookies verdaderamente cross-site, entre dominios totalmente distintos, no solo subdominios):

```python
# main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Con esto: cualquier origen que matchee el regex (todos tus subdominios + localhost) puede mandar y recibir la cookie sin fricción, que es efectivamente "cualquier sitio *tuyo*". Si en algún momento necesitas que un dominio de un tercero (una app externa, un partner) también pueda usar la sesión, simplemente agregas su origen exacto al regex — pero un wildcard universal (`.*`) sí sería un riesgo real de seguridad (cualquier página en internet podría hacer requests autenticados a tu API a nombre de tus usuarios), así que no te lo recomiendo aunque técnicamente se pueda forzar.

**Nota para desarrollo local con `SameSite=None`**: si alguna vez quieres probar el flujo cross-site real en local (no el atajo de `Lax` que ya te cubre `localhost:3000` ↔ `localhost:8000`), vas a necesitar HTTPS local (con `mkcert`, por ejemplo), porque `SameSite=None` sin `Secure=True` es rechazado directamente por el navegador.

### 3.3 CSRF

Con cookies para requests que cambian estado (login, subir canción, borrar usuario), agrega **protección CSRF**: patrón *double-submit cookie* (un header custom `X-CSRF-Token` que el JS del front debe adjuntar, y que un formulario HTML malicioso de tercero no puede replicar) o la librería `fastapi-csrf-protect`. Esto se vuelve **más importante, no menos**, al usar `SameSite=None`, porque estás renunciando a la protección CSRF que `Lax`/`Strict` te daban gratis.

### 3.4 Domino — sigue siendo la opción más simple si aplica

Si en algún punto *no* necesitas acceso multi-dominio real (solo un front y un back tuyos), la opción más simple sigue siendo dominio raíz compartido con subdominios (`app.tudominio.com` / `api.tudominio.com`) y `SameSite=Lax` — evita CSRF casi por completo y no exige `Secure` en local. La solución de la sección 3.2 es la que necesitas si de verdad vas a servir a orígenes distintos (varios frontends, un dominio de testing separado, etc.).

---

## 4. Validación y Enums — cómo lo pediste

- **Nada de `ENUM` nativo de Postgres ni `sa.Enum`**. Las columnas de género, rol de usuario, estado, etc. van como `sa.String` / `sa.Text` en el modelo SQLAlchemy.
- La validación de los valores permitidos vive **solo en Pydantic**, con `Literal[...]` o `enum.Enum` de Python:

```python
# schemas.py
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"

class SongGenre(str, Enum):
    POP = "pop"
    ROCK = "rock"
    HIPHOP = "hip-hop"
    # ...

class SongCreate(BaseModel):
    title: str
    genres: list[SongGenre]
    artist_id: UUID
    lyrics: str | None = None
```

- En el frontend, el **mismo set de valores** se refleja en un `z.enum([...])` de Zod. Como ambos derivan del mismo contrato OpenAPI (sección 1), si agregas un género nuevo solo tocas el `Enum` de Python, regeneras tipos, y TypeScript te avisa en compilación si el front no lo contempla — cero riesgo de migración rota en Neon.

---

## 5. Arquitectura en capas — Python (Routes → Services → Repository → Models)

Confirmado con fuentes actuales de 2026: FastAPI no fuerza ninguna estructura, pero el patrón que describes (capas + organización por *feature*) es exactamente el que recomiendan las guías de arquitectura FastAPI más recientes. La combinación que mejor funciona en la práctica es **capas dentro de cada feature**, no carpetas globales `routes/`, `services/`, `repository/` con todo mezclado:

```
apps/api/
├── app/
│   ├── main.py                    # instancia FastAPI, monta routers, middlewares
│   ├── core/
│   │   ├── config.py              # pydantic-settings (.env tipado)
│   │   ├── security.py            # hashing, csrf, helpers
│   │   └── logging.py
│   ├── db/
│   │   ├── session.py             # engine + get_session() dependency
│   │   └── base.py                # Base declarativa
│   ├── features/
│   │   ├── auth/
│   │   │   ├── router.py          # endpoints (fastapi-users routers montados aquí)
│   │   │   └── manager.py         # UserManager de fastapi-users
│   │   ├── users/
│   │   │   ├── router.py          # CRUD admin de usuarios
│   │   │   ├── service.py         # reglas de negocio (ej: no borrarte a ti mismo)
│   │   │   ├── repository.py      # queries SQLAlchemy puras
│   │   │   ├── models.py          # tabla User (SQLAlchemy)
│   │   │   └── schemas.py         # Pydantic in/out
│   │   ├── artists/
│   │   │   ├── router.py / service.py / repository.py / models.py / schemas.py
│   │   ├── songs/
│   │   │   ├── router.py / service.py / repository.py / models.py / schemas.py
│   │   ├── genres/
│   │   ├── playlists/
│   │   └── uploads/                # generación de presigned URLs (R2)
│   │       ├── router.py
│   │       └── service.py          # boto3 client, validación de content-type/size
│   └── shared/
│       ├── pagination.py
│       └── exceptions.py           # excepciones de dominio + exception_handlers
├── alembic/
├── tests/
├── pyproject.toml
└── uv.lock
```

**Reglas de la capa:**
- `router.py`: solo HTTP — parsea input, llama al `service`, devuelve el `schema` de salida. Cero lógica de negocio ni SQL.
- `service.py`: reglas de negocio ("si el artista no existe, créalo", "un admin no puede borrarse a sí mismo"). Orquesta uno o más `repository`.
- `repository.py`: únicamente queries SQLAlchemy (`select`, `insert`, `update`). No sabe nada de HTTP ni de reglas de negocio.
- `models.py`: tablas SQLAlchemy. `schemas.py`: contratos Pydantic de entrada/salida (nunca expongas el modelo de DB directo en una response).

Inyección de dependencias: FastAPI ya trae un sistema de DI ligero vía `Depends()` — no necesitas un contenedor DI como el de Nest. Cada `service` recibe su `repository` (o la sesión de DB) por `Depends()`.

---

## 6. Arquitectura que impone NestJS (referencia / futuro)

Ya que preguntaste específicamente — si más adelante retomas la idea de tener también un backend en Nest para tu portafolio, esto es lo que **sí te obliga** a diferencia de FastAPI:

- **Modules** (`@Module()`): unidad obligatoria de organización, agrupa controllers + providers de una feature y declara explícitamente qué exporta/importa de otros módulos. FastAPI no tiene equivalente formal — tú decides la carpeta.
- **Controllers** (`@Controller()`): equivalen a tus `router.py`, pero son clases con decoradores, no funciones.
- **Providers/Services** (`@Injectable()`): equivalen a tu `service.py`, pero se registran en un **contenedor de inyección de dependencias real** (al estilo Angular) — Nest resuelve el árbol de dependencias por ti vía constructor injection; en FastAPI tú compones `Depends()` explícitamente en cada endpoint.
- **Repository**: no viene de Nest en sí, sino de la capa de ORM que elijas (TypeORM o Prisma); el patrón repository es opcional igual que en FastAPI.
- Es, en esencia, **Angular aplicado al backend**: mucho boilerplate con decoradores, pero a cambio te da estructura "gratis" y testing con mocks muy cómodo gracias al DI container.

Como tu monorepo definitivo declarado en esta conversación es **solo `apps/web` + `apps/api` (Python)**, este backend Nest queda fuera del alcance de este plan — pero si lo agregas después, puede vivir tranquilamente como `apps/api-nest/` consumiendo la misma Neon DB y el mismo bucket R2, ya que la lógica de negocio (capas) se traduce 1:1.

---

## 7. Testing

### Backend (`apps/api/tests/`)
- **pytest + pytest-asyncio**: tests async nativos.
- **httpx.AsyncClient** contra la app FastAPI (`ASGITransport`) — tests de integración de cada endpoint sin levantar un servidor real.
- **Base de datos de test**: Neon soporta **branching instantáneo** de bases de datos. En CI, crea una branch efímera de Neon por corrida (`neon branches create --parent main`), corre las migraciones de Alembic sobre ella, corre los tests, y bórrala al final. Es más fiel a producción que un Postgres en Docker/testcontainers y no te obliga a mantener dos configuraciones de DB.
- **polyfactory** (o `factory_boy`) para generar fixtures (usuarios, artistas, canciones) sin repetir boilerplate.
- **pytest-cov** para cobertura, con umbral mínimo en CI (ej. 80% en `services/` y `repository/`).
- Casos clave a cubrir: registro/login con cookie, permisos de admin vs usuario normal, creación de canción con artista nuevo inline, generación y expiración de presigned URLs, rate limiting del login.

### Frontend (`apps/web/`)
- **Vitest + React Testing Library** para componentes (ej: el reproductor, el formulario de subida, la vista de letras sin sincronizar).
- **Playwright** para E2E: login → panel → crear artista inline → subir canción → verla en el buscador → reproducirla. Playwright también sirve para testear la instalación de la PWA y el modo offline básico.
- **MSW (Mock Service Worker)** para mockear la API en tests unitarios sin pegarle al backend real.

---

## 8. Frontend — Next.js 16

### 8.1 Fundamentos de la versión (confirmado, agosto 2026)
- **Turbopack** es el bundler por defecto (builds 2-5x más rápidos, Fast Refresh hasta 10x).
- **Cache Components** (`cacheComponents: true` + directiva `"use cache"`): reemplaza el modelo de caché implícito anterior — todo es dinámico por defecto salvo que marques explícitamente qué cachear. Úsalo en las páginas de catálogo (home, artista, álbum) que no cambian por request, y deja dinámico todo lo relacionado a sesión/usuario.
- **`proxy.ts`** reemplaza `middleware.ts` — ahí van tus checks de sesión antes de servir rutas del panel (`/dashboard/*`).
- React 19.2 + React Compiler estable (menos `useMemo`/`useCallback` manuales).

### 8.2 Estructura recomendada

```
apps/web/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                # home tipo Spotify
│   │   ├── artist/[id]/page.tsx
│   │   ├── album/[id]/page.tsx
│   │   └── search/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              # protegido, chequea sesión
│   │   ├── songs/
│   │   │   ├── page.tsx            # listado
│   │   │   └── new/page.tsx        # form: artista (con "crear nuevo"), título, géneros, letra
│   │   ├── artists/
│   │   └── users/                  # CRUD usuarios, solo admin
│   ├── proxy.ts                    # antes middleware.ts
│   └── manifest.ts                 # PWA manifest dinámico
├── components/
│   ├── player/                     # barra de reproducción persistente
│   ├── ui/                         # shadcn/ui
│   └── lyrics/                     # vista de letra sin sincronizar
├── lib/
│   ├── api-client.ts               # wrapper fetch tipado (usa packages/api-types)
│   └── validators/                 # schemas Zod para formularios
├── sw.ts                           # service worker (Serwist)
├── globals.css
└── next.config.ts
```

### 8.3 Comunicación con el backend
Server Components/Server Actions hacen `fetch` directo a la API de FastAPI (con `credentials: "include"` para que viaje la cookie). Para mutaciones desde el panel (crear canción, borrar usuario), usa **Server Actions** que llaman al backend y hacen `revalidatePath`/`revalidateTag` — así aprovechas el nuevo modelo de Cache Components sin tener que reinventar invalidación manual en el cliente.

---

## 9. Tailwind v4 — estilo Spotify

Setup (confirmado v4, 2026): ya no hay `tailwind.config.js`, todo vive en CSS.

```css
/* app/globals.css */
@import "tailwindcss";
@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700;800&family=Inter:wght@400;500;600&display=swap");

@theme {
  /* Base */
  --color-bg-base: oklch(12% 0.01 160);        /* casi negro, con un toque verde */
  --color-bg-elevated: oklch(18% 0.015 160);    /* tarjetas */
  --color-bg-highlight: oklch(24% 0.02 160);    /* hover */

  /* Marca — inspirado en tu imagen (verde bosque -> verde brillante -> menta) */
  --color-brand-900: oklch(35% 0.10 165);
  --color-brand-600: oklch(60% 0.17 155);
  --color-brand-400: oklch(78% 0.18 150);       /* el "Aa" verde principal */
  --color-brand-200: oklch(90% 0.10 165);       /* menta claro, casi blanco */

  --color-text-primary: oklch(98% 0 0);
  --color-text-subdued: oklch(65% 0 0);

  --font-display: "Bricolage Grotesque", system-ui, sans-serif;  /* headings, hero, nombres de artista */
  --font-sans: "Inter", system-ui, sans-serif;                    /* UI, listas, formularios */
  --radius-pill: 9999px;
}

@layer utilities {
  .bg-brand-gradient {
    background-image: linear-gradient(
      135deg,
      var(--color-brand-900) 0%,
      var(--color-brand-600) 35%,
      var(--color-brand-400) 70%,
      var(--color-brand-200) 100%
    );
  }
}
```

Cambié la tipografía de headings de `Inter` genérico a **Bricolage Grotesque** — es gratis (Google Fonts), tiene esa personalidad bold/redondeada que se ve en tu "Aa" de referencia, y da más carácter editorial que un grotesque neutro. `Inter` se mantiene para UI/formularios/listas, donde la legibilidad en tamaños chicos importa más que la personalidad. La utilidad `.bg-brand-gradient` replica esa barra de gradiente verde→menta de tu imagen — úsala en el hero de la home, en el header de la página de artista, o en cards destacadas del panel.

⚠️ **Nota de copyright**: la fuente real de Spotify ("Circular") es propietaria y no puedes usarla legalmente, y su verde de marca específico (`#1DB954`) tampoco conviene replicarlo pixel-perfect si algún día publicas esto. La paleta de arriba está inspirada en la sensación de tu imagen, no calcada.

`postcss.config.mjs` sigue siendo necesario en Next.js (a diferencia de Vite):
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

Usa **shadcn/ui** sobre esta base para inputs, dialogs, dropdowns (combobox para "seleccionar o crear artista") — es el estándar de facto en 2026 y se integra nativamente con `@theme`.

### 9.1 Vista de letras sin sincronización (igual que Spotify)
Cuando Spotify no tiene letras sincronizadas por línea, muestra el texto completo, centrado, en una tipografía grande, con scroll simple y sin resaltado — nada de karaoke. Replica eso: un componente `<LyricsStatic text={song.lyrics} />` con `whitespace-pre-line`, tamaño de fuente grande (`text-2xl` o más en desktop), alineado a la izquierda, sin ningún tipo de highlight por tiempo. El día que agregues sincronización real (LRC), ese mismo componente se reemplaza por uno que resalta línea a línea con el `currentTime` del `<audio>`.

---

## 10. PWA — optimizada para móvil

- **Serwist** (`@serwist/next`) en vez de `next-pwa`: es el mantenido activamente y el que documentan las guías actuales de Next 16 (`next-pwa` está prácticamente abandonado).
- `app/manifest.ts` dinámico (no `public/manifest.json` estático) para poder variar íconos/nombre por entorno (dev/staging/prod).
- Estrategia de caché: *stale-while-revalidate* para assets estáticos y portadas. El audio **no** se cachea automáticamente por reproducción — solo cuando el usuario pide explícitamente "descargar" (sección 10.1), para no llenar el storage del dispositivo sin que la persona lo decida.
- **Media Session API** (`navigator.mediaSession`) para que la canción se controle desde la pantalla de bloqueo/notificación del celular — el toque final que hace que se sienta como una app nativa.
- Mobile-first real: `viewport-fit=cover` + `env(safe-area-inset-*)` para que la barra de reproductor inferior no choque con la barra de gestos de iOS/Android, targets táctiles de mínimo 44×44px, bottom navigation en vez de sidebar en <768px (igual que la app real).

### 10.1 Descarga de canciones para reproducción offline

Esto requiere dos piezas: una **URL estable** que el service worker pueda interceptar (las presigned URLs no sirven para esto porque expiran y cambian los query params en cada request, así que nunca "matchean" en la caché), y la **Cache Storage API** del navegador (mejor que IndexedDB para blobs de audio, porque guarda `Response` completos y soporta bien streaming).

**1. Endpoint estable en el backend**, que resuelve internamente a una presigned URL fresca cada vez:

```python
# features/songs/router.py
@router.get("/songs/{song_id}/stream")
async def stream_song(song_id: UUID, service: SongService = Depends()):
    presigned_url = await service.get_playback_url(song_id)  # expira en minutos
    return RedirectResponse(presigned_url)
```

El frontend (y el service worker) siempre piden `/songs/{id}/stream` — nunca la URL de R2 directamente. El bucket R2 necesita CORS habilitado para `GET` desde el dominio del frontend, porque el `fetch` que hace el navegador termina resolviendo contra el dominio de R2 tras la redirección.

**2. Descarga explícita desde el cliente**, disparada por un botón "Descargar" en la UI (no automático):

```ts
// lib/offline/downloads.ts
async function downloadSong(songId: string) {
  const cache = await caches.open("offline-songs");
  const url = `/api/songs/${songId}/stream`;
  const response = await fetch(url);          // sigue la redirección a R2
  await cache.put(url, response.clone());       // se guarda bajo la URL estable
  await saveDownloadMetadata(songId);            // IndexedDB: título, artista, tamaño, fecha
}
```

**3. Servir desde caché cuando está offline** (en `sw.ts`, junto a Serwist):

```ts
self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("/songs/") && event.request.url.includes("/stream")) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
```

**4. El detalle que casi todo el mundo se salta: `Range` requests.** El elemento `<audio>` pide bytes parciales para poder hacer *seek* (`Range: bytes=1000000-`), y la Cache Storage API no resuelve eso sola — hay que interceptarlo a mano en el `fetch` handler: leer el `Response` cacheado completo como `ArrayBuffer`, cortar el rango pedido, y devolver un `206 Partial Content` con `Content-Range`. Sin esto, la barra de progreso de una canción descargada no permite adelantar/retroceder offline.

**5. Gestión de storage**: pantalla de "Descargas" en el panel de usuario que lista lo descargado (desde la tabla de metadata en IndexedDB), permite borrar individualmente (`cache.delete(url)` + borrar metadata), y muestra el espacio usado con `navigator.storage.estimate()` — avisa si se acerca a la cuota del dispositivo.

---

## 11. Subida de canciones — flujo con presigned URLs

1. Usuario en el panel llena el formulario (`título`, `artista` —autocomplete con opción "+ Crear artista nuevo" que abre un modal inline—, `géneros`, `letra` opcional, archivo `.mp3`).
2. Frontend pide al backend `POST /uploads/presign` con `{ filename, content_type, size }`.
3. Backend (`uploads/service.py`) valida `content_type == "audio/mpeg"` y tamaño máximo, genera un `object_key` (ej. `songs/{artist_id}/{uuid}.mp3`) y devuelve una **presigned PUT URL de R2** de corta duración (5-10 min) vía boto3.
4. El navegador sube el archivo **directo a R2** con ese PUT (el archivo nunca pasa por tu servidor FastAPI — importante para no saturar el backend con bytes de audio).
5. Al terminar el `PUT`, el frontend llama `POST /songs` con la metadata + el `object_key` confirmado. Ahí es donde, si el `artist_id` viene vacío pero hay `artist_name`, el `service` crea el artista antes de crear la canción (todo en una transacción).
6. Para reproducir, el backend nunca expone la URL pública directa del bucket: genera un **presigned GET URL** de corta duración al servir la canción (o usa un dominio público de R2 restringido si prefieres simplicidad sobre control de acceso fino).

---

## 12. Roadmap sugerido (fases)

1. **Fase 0 — Fundaciones**: monorepo, CI básico, `apps/api` con auth (`fastapi-users` + cookie) y `apps/web` con login/logout funcionando contra la API real.
2. **Fase 1 — Catálogo**: CRUD artistas/canciones/géneros, subida a R2 con presigned URLs, panel de administración.
3. **Fase 2 — Experiencia usuario**: home, búsqueda, página de artista/álbum, reproductor persistente con Media Session API, vista de letras estática.
4. **Fase 3 — Gestión de usuarios + tests**: CRUD de usuarios (roles admin/user), suite de tests backend y frontend, cobertura mínima en CI.
5. **Fase 4 — PWA + pulido móvil**: Serwist, manifest, bottom nav móvil, safe areas, performance (Lighthouse PWA + Core Web Vitals).
6. **Fase 5 — Deploy**: `apps/web` en Vercel; `apps/api` en Railway/Fly.io/Render (proceso persistente, no funciones serverless, por el pool de conexiones a Neon y porque no hay límite de duración de request); dominio propio con subdominios `app.` / `api.` para que las cookies funcionen sin fricción (sección 3.1).

---

## 13. Checklist de seguridad backend

- [ ] Cookies: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, dominio raíz compartido.
- [ ] CSRF: double-submit token o `fastapi-csrf-protect` en todo endpoint mutante.
- [ ] Rate limiting (`slowapi`) en `/auth/login`, `/auth/register`, `/uploads/presign`.
- [ ] Passwords con Argon2 (vía `passlib`), nunca bcrypt-solo ni SHA plano.
- [ ] CORS restringido a los dominios exactos del frontend (nada de `*`).
- [ ] Secrets vía `pydantic-settings` + variables de entorno, nunca hardcodeados.
- [ ] Presigned URLs de subida con expiración corta (5-10 min) y `Content-Type`/tamaño validados en el backend antes de firmarlas.
- [ ] Validación estricta de roles: endpoints de `/users/*` y `/artists`, `/songs` (creación/edición) requieren `is_superuser`/`role=admin` vía dependencia `Depends(require_admin)`.
- [ ] Migraciones de Alembic corridas contra la conexión *direct* de Neon, nunca la *pooled*.
- [ ] Logs sin datos sensibles (no loguear cookies, passwords ni tokens).

---

Con esto tienes la base completa: estructura de repo, elección de librerías justificadas, el equivalente exacto de Better Auth, cómo resolver el problema real de cookies entre dos dominios, la arquitectura en capas explicada (y su contraparte en Nest si la retomas), el flujo completo de subida con R2, testing con branching de Neon, y el plan de PWA mobile-first.

¿Por dónde quieres que empecemos a construir? Puedo generar ya el `docker-compose`/estructura inicial del monorepo, el modelo de datos completo en SQLAlchemy, o el flujo de auth con `fastapi-users` funcionando end-to-end.
