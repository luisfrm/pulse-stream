/**
 * Paginación offset/limit (espejo de `app/shared/pagination.py`).
 */

import { z } from "@hono/zod-openapi";

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export function paginate<T>(
  items: readonly T[],
  total: number,
  offset: number,
  limit: number,
): Page<T> {
  return { items: [...items], total, offset, limit };
}

/**
 * Query params comunes de los listados. Los valores llegan como string desde
 * la URL: se coaccionan a int con los mismos límites que FastAPI
 * (`offset >= 0`, `1 <= limit <= 100`).
 */
export function pageQuerySchema(defaultLimit = 50, maxLimit = 100) {
  return z.object({
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
  });
}
