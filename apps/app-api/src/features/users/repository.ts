import type { QueryResultRow, Queryable } from "../../db/types";

/**
 * Acceso a `users`.
 *
 * SQL parametrizado (sin interpolación de valores). El cliente es por request
 * (`db/client.ts`) y lo comparte con `catalog`/`writes`; el cierre vive en
 * `app.ts` (`ctx.waitUntil`), nunca en el repository.
 *
 * No hay alta pública ni OAuth: las cuentas se crean con el seed del panel.
 */
export interface UserRecord extends QueryResultRow {
  id: string;
  email: string;
  hashed_password: string | null;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  role: string | null;
  username: string | null;
  cover_key: string | null;
  total_plays: number;
}

export interface UserRepository {
  getById(id: string): Promise<UserRecord | null>;
  /** Login con email o username (case-insensitive). */
  findByIdentifier(identifier: string): Promise<UserRecord | null>;
  /** Cierra el cliente si el repository es dueño de uno (tests/producción). */
  close?(): Promise<void>;
}

/** Conflicto de unicidad de `users.username` al editar el perfil. */
export class UsernameTakenError extends Error {
  constructor() {
    super("Username already taken");
    this.name = "UsernameTakenError";
  }
}

const USER_COLUMNS = [
  "id",
  "email",
  "hashed_password",
  "is_active",
  "is_superuser",
  "is_verified",
  "role",
  "username",
  "cover_key",
  "total_plays",
].join(", ");

const USER_COLUMNS_QUALIFIED = USER_COLUMNS.split(", ")
  .map((column) => `u.${column}`)
  .join(", ");

export class PgUserRepository implements UserRepository {
  constructor(private readonly client: Queryable | null) {}

  private get db(): Queryable {
    if (!this.client) {
      throw new Error("Database is not configured: set DATABASE_URL");
    }
    return this.client;
  }

  private async rows<T extends QueryResultRow>(
    text: string,
    values: unknown[],
  ): Promise<T[]> {
    const result = await this.db.query<T>(text, values);
    return result.rows;
  }

  async getById(id: string): Promise<UserRecord | null> {
    const rows = await this.rows<UserRecord>(
      `SELECT ${USER_COLUMNS_QUALIFIED} FROM users u WHERE u.id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByIdentifier(identifier: string): Promise<UserRecord | null> {
    // Login con email o username. El ORDER BY prioriza el email exacto si
    // ambos coinciden; `lower(NULL)` no matchea.
    const rows = await this.rows<UserRecord>(
      `SELECT ${USER_COLUMNS_QUALIFIED}
         FROM users u
        WHERE lower(u.email) = lower($1)
           OR lower(u.username) = lower($1)
        ORDER BY (lower(u.email) = lower($1)) DESC
        LIMIT 1`,
      [identifier],
    );
    return rows[0] ?? null;
  }
}
