/**
 * Normalización del contrato OpenAPI para el gate de paridad.
 *
 * El objetivo es comparar `components.schemas` de este Worker contra el que
 * emite el backend Python (Pydantic) sin que ruido irrelevante (títulos,
 * `description`, `minLength`, `pattern`, orden de propiedades) haga fallar el
 * test. Se conserva lo que define el tipo que consume el web:
 *   - `required` (ordenado);
 *   - nombres de propiedades (ordenados);
 *   - `type`/`format` de las primitivas;
 *   - destinos de `$ref`, `anyOf`/`oneOf` y `items`;
 *   - `enum` (valores ordenados);
 *   - `default` (es lo que hace que `openapi-typescript` genere el campo como
 *     no-opcional: `defaultNonNullable`).
 *
 * `type: ["string", "null"]` (forma compacta de zod) se canoniza al mismo
 * `union` que emite Pydantic (`anyOf: [{type:"string"}, {type:"null"}]`).
 */

export type NormalizedSchema =
  | { kind: "primitive"; type: string; format?: string; default?: unknown }
  | { kind: "ref"; ref: string; default?: unknown }
  | { kind: "enum"; values: string[]; default?: unknown }
  | { kind: "union"; of: NormalizedSchema[]; default?: unknown }
  | { kind: "array"; items: NormalizedSchema; default?: unknown }
  | { kind: "any"; default?: unknown }
  | {
      kind: "object";
      required: string[];
      properties: Record<string, NormalizedSchema>;
      default?: unknown;
    };

export type NormalizedComponents = Record<string, NormalizedSchema>;

/**
 * Componentes donde el Worker difiere a propósito del backend Python:
 * `UserCreate`/`UserUpdate` NO aceptan `role`/`is_superuser`/`is_active`/
 * `is_verified` (eran un vector de escalada de privilegios). Se excluyen del
 * gate de paridad y se validan aparte en `contract.test.ts`.
 */
export const CONTRACT_DEVIATIONS = ["UserCreate", "UserUpdate"] as const;

type JsonObject = Record<string, unknown>;

const COMPONENT_REF_PREFIX = "#/components/schemas/";

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withDefault(
  node: NormalizedSchema,
  raw: JsonObject,
): NormalizedSchema {
  if (!("default" in raw)) return node;
  return { ...node, default: raw.default };
}

function primitive(
  type: string,
  format: string | undefined,
): NormalizedSchema {
  return format === undefined
    ? { kind: "primitive", type }
    : { kind: "primitive", type, format };
}

function compareNodes(a: NormalizedSchema, b: NormalizedSchema): number {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeNode(
  raw: unknown,
  path: string,
  schemas: Record<string, unknown>,
): NormalizedSchema {
  if (!isJsonObject(raw)) {
    throw new Error(`Schema no reconocido en ${path}: ${JSON.stringify(raw)}`);
  }

  if (typeof raw.$ref === "string") {
    const ref = raw.$ref.startsWith(COMPONENT_REF_PREFIX)
      ? raw.$ref.slice(COMPONENT_REF_PREFIX.length)
      : raw.$ref;

    // Los enums se resuelven inline: zod-to-openapi no puede emitir `$ref` +
    // `default` a la vez (pierde el default), así que algunos usos quedan
    // inline. Semánticamente es el mismo tipo, y el componente enum se sigue
    // comparando por separado.
    const target = schemas[ref];
    if (isJsonObject(target) && Array.isArray(target.enum)) {
      return withDefault(normalizeNode(target, ref, schemas), raw);
    }

    return withDefault({ kind: "ref", ref }, raw);
  }

  const unionMembers = Array.isArray(raw.anyOf)
    ? raw.anyOf
    : Array.isArray(raw.oneOf)
      ? raw.oneOf
      : undefined;

  if (unionMembers) {
    const of = unionMembers
      .map((member, index) => normalizeNode(member, `${path}.union[${index}]`, schemas))
      .sort(compareNodes);
    return withDefault({ kind: "union", of }, raw);
  }

  if (Array.isArray(raw.enum)) {
    const values = raw.enum.map((value) => String(value)).sort();
    return withDefault({ kind: "enum", values }, raw);
  }

  // Forma compacta `type: ["string", "null"]` -> union equivalente. Se
  // reconstruye cada rama desde el schema original para no perder `items`,
  // `properties` ni `format` (ej. `z.array(...).nullable()`).
  if (Array.isArray(raw.type)) {
    const { default: _default, ...rest } = raw;
    const of = raw.type
      .map((type) => String(type))
      .map((type) => {
        if (type === "null") return primitive("null", undefined);
        return normalizeNode({ ...rest, type }, `${path}|${type}`, schemas);
      })
      .sort(compareNodes);
    return withDefault({ kind: "union", of }, raw);
  }

  if (raw.type === "array") {
    return withDefault(
      { kind: "array", items: normalizeNode(raw.items, `${path}[]`, schemas) },
      raw,
    );
  }

  if (raw.type === "object" || isJsonObject(raw.properties)) {
    const rawProperties = isJsonObject(raw.properties) ? raw.properties : {};
    const properties: Record<string, NormalizedSchema> = {};
    for (const key of Object.keys(rawProperties).sort()) {
      properties[key] = normalizeNode(
        rawProperties[key],
        `${path}.${key}`,
        schemas,
      );
    }
    const required = Array.isArray(raw.required)
      ? raw.required.map((key) => String(key)).sort()
      : [];
    return { kind: "object", required, properties };
  }

  if (typeof raw.type === "string") {
    const format = typeof raw.format === "string" ? raw.format : undefined;
    return withDefault(primitive(raw.type, format), raw);
  }

  // `Any` de Pydantic (`{"title": "Input"}`) y `{}` de zod: sin restricciones.
  // Pydantic lo usa en `ValidationError.input`; compararlo como nodo "any"
  // mantiene el gate útil (nombres/required/defaults) sin ruido.
  if (raw.type === undefined && raw.properties === undefined) {
    return withDefault({ kind: "any" }, raw);
  }

  throw new Error(`Schema sin \`type\` en ${path}: ${JSON.stringify(raw)}`);
}

/** Normaliza `components.schemas` completo (claves ordenadas). */
export function normalizeComponents(
  schemas: Record<string, unknown>,
): NormalizedComponents {
  const normalized: NormalizedComponents = {};
  for (const name of Object.keys(schemas).sort()) {
    normalized[name] = normalizeNode(schemas[name], name, schemas);
  }
  return normalized;
}

// --- Paths (rutas + status + $ref de cada body) ------------------------------

/** Una operación: códigos de estado y el `$ref` del body JSON de cada uno. */
export interface NormalizedOperation {
  /** Códigos ordenados numéricamente (`[200, 422]`). */
  statuses: number[];
  /** status -> `$ref` del schema JSON (`null` si no hay body o es inline). */
  refs: Record<string, string | null>;
}

/** path -> method -> operación. */
export type NormalizedPaths = Record<string, Record<string, NormalizedOperation>>;

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

function responseRef(response: unknown): string | null {
  if (!isJsonObject(response)) return null;
  const content = response.content;
  if (!isJsonObject(content)) return null;
  const media = content["application/json"];
  if (!isJsonObject(media)) return null;
  const schema = media.schema;
  if (!isJsonObject(schema)) return null;
  const ref = schema.$ref;
  return typeof ref === "string" ? ref : null;
}

/**
 * Normaliza `paths`: para cada ruta+método guarda los códigos de respuesta y el
 * `$ref` de cada body. Es lo que detecta una ruta faltante, un status cambiado
 * (200 vs 201) o un componente distinto, sin comparar descripciones.
 */
export function normalizePaths(paths: Record<string, unknown>): NormalizedPaths {
  const normalized: NormalizedPaths = {};

  for (const path of Object.keys(paths).sort()) {
    const item = paths[path];
    if (!isJsonObject(item)) continue;

    const operations: Record<string, NormalizedOperation> = {};
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (!isJsonObject(operation)) continue;

      const responses = isJsonObject(operation.responses)
        ? operation.responses
        : {};
      const statuses = Object.keys(responses)
        .map((status) => Number.parseInt(status, 10))
        .filter((status) => Number.isFinite(status))
        .sort((left, right) => left - right);

      const refs: Record<string, string | null> = {};
      for (const status of statuses) {
        refs[String(status)] = responseRef(responses[String(status)]);
      }
      operations[method] = { statuses, refs };
    }

    // Un path sin operaciones (solo `parameters` compartidos) no aporta.
    if (Object.keys(operations).length > 0) normalized[path] = operations;
  }

  return normalized;
}
