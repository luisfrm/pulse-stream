/**
 * Validación zod con el shape de error de FastAPI/Pydantic.
 *
 * El contrato del web ya consume:
 *   422 { "detail": [ { "type", "loc": ["body"|"query"|"path", ...], "msg", "input" } ] }
 * así que traducimos los issues de zod a ese formato en un solo lugar.
 */

import type { Context } from "hono";
import type { ZodError, ZodIssue } from "zod";

export type ValidationLocation = "body" | "query" | "path" | "header" | "cookie";

export interface FastApiValidationIssue {
  type: string;
  /** Los índices de array se preservan como números (igual que Pydantic). */
  loc: Array<string | number>;
  msg: string;
  input?: unknown;
}

export interface FastApiValidationErrorBody {
  detail: FastApiValidationIssue[];
}

/** `target` de @hono/zod-openapi -> prefijo de `loc` en FastAPI. */
const TARGET_TO_LOCATION: Record<string, ValidationLocation> = {
  json: "body",
  form: "body",
  query: "query",
  param: "path",
  header: "header",
  cookie: "cookie",
};

/**
 * Tipo esperado por zod -> `type`/`msg` de Pydantic.
 * Un solo record para no repetir el mapeo en cada rama.
 */
const EXPECTED_TYPE_TO_PYDANTIC: Record<
  string,
  { type: string; msg: string }
> = {
  string: { type: "string_type", msg: "Input should be a valid string" },
  int: { type: "int_type", msg: "Input should be a valid integer" },
  // zod v4 reporta `expected: "number"` tanto para `z.int()` como para
  // `z.number()` (no distingue en el issue). Todos los numéricos del contrato
  // son enteros (centavos, segundos, contadores), así que mapeamos a `int_type`.
  number: { type: "int_type", msg: "Input should be a valid integer" },
  float: { type: "float_type", msg: "Input should be a valid number" },
  boolean: { type: "bool_type", msg: "Input should be a valid boolean" },
  array: { type: "list_type", msg: "Input should be a valid list" },
  object: { type: "dict_type", msg: "Input should be a valid dictionary" },
  null: { type: "none_required", msg: "Input should be None" },
  bigint: { type: "int_type", msg: "Input should be a valid integer" },
  date: { type: "datetime_type", msg: "Input should be a valid datetime" },
  record: { type: "dict_type", msg: "Input should be a valid dictionary" },
  map: { type: "dict_type", msg: "Input should be a valid dictionary" },
  tuple: { type: "tuple_type", msg: "Input should be a valid tuple" },
  set: { type: "set_type", msg: "Input should be a valid set" },
  file: { type: "is_instance_of", msg: "Input should be a valid file" },
};

/**
 * `true` si el issue es una clave AUSENTE (Pydantic: `missing`/"Field required").
 *
 * zod v4 no incluye `input` en los issues (la opción `reportInput` del config
 * no está conectada), así que la única señal disponible es el mensaje por
 * defecto: "Invalid input: expected X, received undefined". No aplicamos
 * mensajes custom en los DTOs, así que el formato es estable.
 */
function isMissingIssue(issue: ZodIssue & { code: "invalid_type" }): boolean {
  return issue.expected !== "undefined" && /received undefined$/.test(issue.message);
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function quoteValues(values: readonly unknown[]): string {
  return values.map((value) => `'${String(value)}'`).join(" or ");
}

function mapIssue(issue: ZodIssue): Omit<FastApiValidationIssue, "loc"> {
  switch (issue.code) {
    case "invalid_type": {
      if (isMissingIssue(issue)) {
        return { type: "missing", msg: "Field required" };
      }
      const mapped = EXPECTED_TYPE_TO_PYDANTIC[issue.expected];
      return {
        type: mapped?.type ?? "value_error",
        msg: mapped?.msg ?? `Input should be a valid ${issue.expected}`,
      };
    }

    case "too_small": {
      if (issue.origin === "string" || issue.origin === "array") {
        const kind = issue.origin === "string" ? "String" : "List";
        return {
          type: issue.origin === "string" ? "string_too_short" : "too_short",
          msg: `${kind} should have at least ${issue.minimum} ${pluralize(
            Number(issue.minimum),
            "character",
            "characters",
          )}`,
          input: issue.input,
        };
      }
      return {
        type: issue.inclusive === false ? "greater_than" : "greater_than_equal",
        msg: `Input should be greater than ${issue.inclusive === false ? "" : "or equal to "}${issue.minimum}`,
        input: issue.input,
      };
    }

    case "too_big": {
      if (issue.origin === "string" || issue.origin === "array") {
        const kind = issue.origin === "string" ? "String" : "List";
        return {
          type: issue.origin === "string" ? "string_too_long" : "too_long",
          msg: `${kind} should have at most ${issue.maximum} ${pluralize(
            Number(issue.maximum),
            "character",
            "characters",
          )}`,
          input: issue.input,
        };
      }
      return {
        type: issue.inclusive === false ? "less_than" : "less_than_equal",
        msg: `Input should be less than ${issue.inclusive === false ? "" : "or equal to "}${issue.maximum}`,
        input: issue.input,
      };
    }

    case "invalid_format": {
      switch (issue.format) {
        case "uuid":
          return {
            type: "uuid_parsing",
            msg: "Input should be a valid UUID",
            input: issue.input,
          };
        case "regex":
          return {
            type: "string_pattern_mismatch",
            msg: `String should match pattern '${issue.pattern ?? ""}'`,
            input: issue.input,
          };
        case "datetime":
          return {
            type: "datetime_parsing",
            msg: "Input should be a valid datetime",
            input: issue.input,
          };
        case "url":
          return {
            type: "url_parsing",
            msg: "Input should be a valid URL",
            input: issue.input,
          };
        default:
          // Sin mensajes hardcodeados (email incluido): el de zod es el que ve
          // el cliente y el `type` es el genérico de Pydantic para value_error.
          return {
            type: "value_error",
            msg: issue.message || `Invalid ${issue.format}`,
            input: issue.input,
          };
      }
    }

    case "invalid_value":
      return {
        type: "enum",
        msg: `Input should be ${quoteValues(issue.values)}`,
        input: issue.input,
      };

    case "not_multiple_of":
      return {
        type: "multiple_of",
        msg: `Input should be a multiple of ${issue.divisor}`,
        input: issue.input,
      };

    case "unrecognized_keys":
      return {
        type: "extra_forbidden",
        msg: `Extra inputs are not permitted`,
        input: issue.input,
      };

    case "custom": {
      const message = issue.message.startsWith("Value error")
        ? issue.message
        : `Value error, ${issue.message}`;
      return { type: "value_error", msg: message, input: issue.input };
    }

    default:
      return {
        type: "value_error",
        msg: issue.message || "Invalid value",
        input: "input" in issue ? issue.input : undefined,
      };
  }
}

/** `loc` de zod: strings tal cual, índices de array como números. */
function toLocSegment(key: PropertyKey): string | number {
  return typeof key === "number" ? key : String(key);
}

/** Convierte un issue (posiblemente anidado) en issues planos de FastAPI. */
function flattenIssue(
  issue: ZodIssue,
  prefix: Array<string | number>,
): FastApiValidationIssue[] {
  if (issue.code === "invalid_union") {
    // Pydantic reporta cada rama del union; nos quedamos con la primera para
    // no inflar el body (el status 422 es lo que importa al cliente).
    const [first] = issue.errors ?? [];
    if (first && first.length > 0) {
      return first.flatMap((nested) => flattenIssue(nested, prefix));
    }
  }

  const path = [...prefix, ...(issue.path ?? []).map(toLocSegment)];

  if (issue.code === "invalid_key" || issue.code === "invalid_element") {
    return issue.issues.flatMap((nested) => flattenIssue(nested, path));
  }

  return [{ loc: path, ...mapIssue(issue) }];
}

/**
 * Traduce un `ZodError` al body 422 de FastAPI.
 * `target` es el `target` que entrega el hook de @hono/zod-openapi
 * (`json` | `query` | `param` | ...).
 */
export function toFastApiValidationError(
  error: ZodError,
  target: string,
): FastApiValidationErrorBody {
  const location = TARGET_TO_LOCATION[target] ?? "body";

  const detail = error.issues.flatMap((issue) => flattenIssue(issue, []));

  return {
    detail: detail.map((issue) => ({
      ...issue,
      loc: [location, ...issue.loc],
    })),
  };
}

interface HookResult {
  target: string;
  success: boolean;
  error?: ZodError;
}

/**
 * `defaultHook` para `new OpenAPIHono({ defaultHook: fastApiValidationHook })`.
 * Devuelve 422 con el body de Pydantic; si la validación pasa no hace nada.
 */
export function fastApiValidationHook(
  result: HookResult,
  c: Context,
): Response | undefined {
  if (result.success || !result.error) return undefined;
  return c.json(toFastApiValidationError(result.error, result.target), 422);
}
