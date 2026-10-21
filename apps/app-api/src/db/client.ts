import { neon } from "@neondatabase/serverless";
import { Client, type QueryResult, type QueryResultRow } from "pg";

import type { Env } from "../env";
import { PgCatalogRepository, type CatalogRepository } from "../features/catalog/repository";
import { PgUserRepository, type UserRepository } from "../features/users/repository";
import type { Queryable } from "./types";

/**
 * Hyperdrive en producción; `DATABASE_URL` para `wrangler dev` sin binding y
 * tests locales.
 */
export function databaseConnectionString(env: Env): string | undefined {
  const hyperdrive = env.HYPERDRIVE?.connectionString?.trim();
  if (hyperdrive) return hyperdrive;
  return env.DATABASE_URL?.trim() || undefined;
}

/**
 * Un solo `pg.Client` por request, conectado perezosamente en la primera
 * query y compartido por `users` + `catalog` (Fase 2). `end()` es no-op si el
 * request nunca tocó la DB.
 */
export class RequestDatabase implements Queryable {
  private client: Client | null = null;

  constructor(private readonly connectionString: string | null) {}

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.getClient().query<T>(text, values);
  }

  async end(): Promise<void> {
    const client = this.client;
    if (!client) return;
    this.client = null;
    await client.end();
  }

  private getClient(): Client {
    if (!this.connectionString) {
      throw new Error(
        "Database is not configured: bind HYPERDRIVE or set DATABASE_URL",
      );
    }

    this.client ??= new Client({
      connectionString: this.connectionString,
      connectionTimeoutMillis: 10_000,
    });

    return this.client;
  }
}

export interface RequestRepositories {
  users: UserRepository;
  catalog: CatalogRepository;
  /** Cierra el `pg.Client` compartido del request (una sola vez). */
  close(): Promise<void>;
}

/**
 * Driver HTTP de Neon para desarrollo local (`wrangler dev`).
 *
 * `pg` sobre TCP no completa la conexión contra Neon en el runtime local de
 * Miniflare; el driver HTTP usa `fetch` y funciona igual en Workers. En
 * producción se sigue usando Hyperdrive + `pg` (`RequestDatabase`).
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
    // Los repositorios solo leen `.rows`; el resto del shape de `pg` no aplica.
    return {
      rows,
      rowCount: rows.length,
      command: "SELECT",
      oid: 0,
      fields: [],
    } as QueryResult<T>;
  }

  async end(): Promise<void> {
    // HTTP: no hay conexión persistente que cerrar.
  }
}

/** Wiring de producción: users + catalog sobre una única conexión. */
export function createRequestRepositories(env: Env): RequestRepositories {
  const useNeonHttp = env.ENV === "local" && Boolean(env.DATABASE_URL);
  const database = useNeonHttp
    ? new NeonHttpDatabase(env.DATABASE_URL as string)
    : new RequestDatabase(databaseConnectionString(env) ?? null);

  return {
    users: new PgUserRepository(database),
    catalog: new PgCatalogRepository(database),
    close: () => database.end(),
  };
}
