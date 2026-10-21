/**
 * Contrato mínimo que usan los repositories.
 *
 * El Worker habla con Neon por HTTP (`@neondatabase/serverless`) en local y en
 * producción, así que solo necesitamos `rows`/`rowCount`. No hay `pg.Client`
 * ni conexiones TCP que compartir entre requests.
 */
export type QueryResultRow = Record<string, unknown>;

export interface QueryResult<T extends QueryResultRow = QueryResultRow> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}
