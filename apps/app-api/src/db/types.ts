import type { QueryResult, QueryResultRow } from "pg";

/**
 * Subconjunto estructural de `pg.Client` que usan los repositories.
 *
 * Permite compartir un único `pg.Client` por request entre `users` y
 * `catalog` (`db/client.ts`) y testear SQL con un fake en memoria, sin abrir
 * conexiones reales.
 */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}
