# AGENTS.md — Reglas de arquitectura del proyecto

Este archivo documenta las convenciones de arquitectura del backend para que
cualquier persona (o agente de IA) que trabaje en este repo mantenga el mismo
patrón. Vive en la raíz del monorepo o en `apps/api/` — lo que resulte más
cómodo una vez esté scaffoldeado.

---

## 1. Backend Python (`apps/api`) — arquitectura en capas

FastAPI **no impone** ninguna estructura (es un framework sin opinión), pero
este proyecto sigue un patrón de capas + organización por *feature*, que es
el recomendado en la comunidad para proyectos de este tamaño.

### 1.1 Estructura de carpetas

```
apps/api/
├── app/
│   ├── main.py                    # instancia FastAPI, monta routers, middlewares
│   ├── core/
│   │   ├── config.py              # pydantic-settings (.env tipado, incluye Environment enum)
│   │   ├── security.py            # hashing, csrf, helpers
│   │   └── logging.py
│   ├── db/
│   │   ├── session.py             # engine + get_session() dependency
│   │   └── base.py                # Base declarativa
│   ├── features/
│   │   ├── auth/
│   │   ├── users/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── repository.py
│   │   │   ├── models.py
│   │   │   └── schemas.py
│   │   ├── artists/
│   │   ├── songs/
│   │   ├── genres/
│   │   ├── playlists/
│   │   └── uploads/                # presigned URLs de R2
│   └── shared/
│       ├── pagination.py
│       └── exceptions.py
├── alembic/
├── tests/
├── pyproject.toml
└── uv.lock
```

### 1.2 Reglas de cada capa

| Capa | Responsabilidad | Nunca hace |
|---|---|---|
| `router.py` | Solo HTTP: parsea input, llama al `service`, devuelve el `schema` de salida. | Lógica de negocio ni SQL. |
| `service.py` | Reglas de negocio (ej: "si el artista no existe, créalo", "un admin no puede borrarse a sí mismo"). Orquesta uno o más `repository`. | Saber nada de HTTP (status codes, headers) ni escribir SQL directo. |
| `repository.py` | Únicamente queries SQLAlchemy (`select`, `insert`, `update`). | Reglas de negocio ni validación de permisos. |
| `models.py` | Tablas SQLAlchemy. | Exponerse directamente en una response — siempre se mapea a un `schema`. |
| `schemas.py` | Contratos Pydantic de entrada/salida. Enums/`Literal` de validación viven aquí, **nunca** como `sa.Enum`/`ENUM` de Postgres en `models.py`. | — |

**Inyección de dependencias**: FastAPI ya trae DI ligero vía `Depends()`. No
se usa (ni se necesita) un contenedor DI como el de Nest — cada `service`
recibe su `repository` o la sesión de DB explícitamente vía `Depends()` en
el router.

**Regla de enums**: los valores permitidos (roles, géneros, estados) se
validan **solo en Pydantic** con `enum.Enum`/`Literal`. Las columnas en la
base de datos son `VARCHAR`/`TEXT` planas — así un cambio en los valores
permitidos nunca rompe una migración de Alembic ni corrompe un tipo nativo
de Postgres.

---

## 2. Arquitectura que impone NestJS (referencia)

Si en el futuro se agrega un backend paralelo en NestJS (`apps/api-nest/`)
para portafolio, esto es lo que Nest sí obliga, a diferencia de FastAPI:

- **Modules (`@Module()`)**: unidad obligatoria de organización. Agrupa
  controllers + providers de una feature y declara explícitamente qué
  exporta/importa de otros módulos. FastAPI no tiene equivalente formal —
  la carpeta por feature (sección 1.1) cumple el mismo rol por convención,
  no por imposición del framework.
- **Controllers (`@Controller()`)**: equivalen a `router.py`, pero son
  clases con decoradores en vez de funciones.
- **Providers/Services (`@Injectable()`)**: equivalen a `service.py`, pero
  se registran en un **contenedor de inyección de dependencias real**
  (al estilo Angular) — Nest resuelve el árbol de dependencias por
  constructor injection; en FastAPI se compone `Depends()` explícitamente
  en cada endpoint.
- **Repository**: no viene de Nest en sí, sino de la capa de ORM elegida
  (TypeORM o Prisma); el patrón repository es opcional igual que en FastAPI.

En esencia, NestJS es Angular aplicado al backend: más boilerplate con
decoradores, pero a cambio da estructura "gratis" y testing con mocks muy
cómodo gracias al DI container. FastAPI da más libertad, a cambio de que el
equipo tenga que sostener la convención (este documento) a mano.

Si se agrega ese backend paralelo, reutiliza la misma Neon DB y el mismo
bucket R2 — la lógica de negocio de cada `service.py` se traduce
prácticamente 1:1 a un `@Injectable()` de Nest.

---

## 3. Convenciones generales para agentes/colaboradores

- No mezclar capas: si un `router.py` empieza a tener `if`/`else` de reglas
  de negocio, esa lógica se mueve a `service.py`.
- No exponer modelos de SQLAlchemy directamente en una response — siempre
  pasar por un `schema` de Pydantic.
- Los tipos usados en el frontend (`packages/api-types`) se generan desde
  el OpenAPI schema del backend (`/openapi.json`), nunca se declaran a mano
  en TypeScript para evitar que backend y frontend se desincronicen.
- Cualquier cambio a un enum de dominio (roles, géneros, estados) se hace
  únicamente en `schemas.py` del feature correspondiente — nunca en la
  definición de la columna en `models.py`.
