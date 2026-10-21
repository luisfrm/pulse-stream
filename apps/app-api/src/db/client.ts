import { neon } from "@neondatabase/serverless";

import type { Env } from "../env";
import { PgCatalogRepository, type CatalogRepository } from "../features/catalog/repository";
import { PgUserRepository, type UserRepository } from "../features/users/repository";
import { PgWritesRepository, type WritesRepository } from "../features/writes/repository";
import type { Queryable, QueryResult, QueryResultRow } from "./types";

/**
 * Driver HTTP de Neon para local y producción.
 *
 * `@neondatabase/serverless` usa `fetch` (sin TCP), así que el mismo camino
 * funciona en `wrangler dev` y en el Worker desplegado. No hay Hyperdrive ni
 * `pg.Client`: cada query es un request HTTP a Neon.
 *
 * El driver HTTP no soporta transacciones interactivas (`BEGIN`/`COMMIT`);
 * las mutaciones multi-tabla se escriben como una sola sentencia con CTEs.
 */
export class NeonHttpDatabase implements Queryable {
  private readonly sql: ReturnType<typeof neon>;

  constructor(connectionString: string) {
    this.sql = neon(connectionString);
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    const result = await this.sql.query(text, values ?? []);
    // `neon()` puede devolver un array (default) o `FullQueryResults` según las
    // opciones; normalizamos a filas.
    const rows = (Array.isArray(result) ? result : result.rows) as T[];
    return { rows, rowCount: rows.length };
  }

  async end(): Promise<void> {
    // HTTP: no hay conexión persistente que cerrar.
  }
}

/**
 * Placeholder para tests y `gen:openapi` (no hay `DATABASE_URL`).
 * Los repositories existen, pero cualquier query falla con un mensaje claro.
 */
class UnconfiguredDatabase implements Queryable {
  async query<T extends QueryResultRow = QueryResultRow>(): Promise<
    QueryResult<T>
  > {
    throw new Error("Database is not configured: set DATABASE_URL");
  }

  async end(): Promise<void> {}
}

export interface RequestRepositories {
  users: UserRepository;
  catalog: CatalogRepository;
  writes: WritesRepository;
  /** No-op en HTTP; se mantiene para el ciclo de vida de `app.ts`. */
  close(): Promise<void>;
}

export function createRequestRepositories(env: Env): RequestRepositories {
  const database = env.DATABASE_URL?.trim()
    ? new NeonHttpDatabase(env.DATABASE_URL.trim())
    : new UnconfiguredDatabase();

  return {
    users: new PgUserRepository(database),
    catalog: new PgCatalogRepository(database),
    writes: new PgWritesRepository(database),
    close: () => database.end(),
  };
}
