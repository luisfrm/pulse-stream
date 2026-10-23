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
