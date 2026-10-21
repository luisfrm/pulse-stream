import type { QueryResultRow } from "pg";

import type { Queryable } from "../../db/types";

/**
 * Acceso a `users` + `oauth_accounts`.
 *
 * SQL parametrizado (sin interpolación de valores). El cliente es por request
 * (`db/client.ts`) y lo comparte con `catalog`; el cierre vive en `app.ts`
 * (`ctx.waitUntil`), nunca en el repository.
 */
export const GOOGLE_PROVIDER = "google";

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

export interface CreateUserWithOAuthInput {
  email: string;
  username: string;
  provider: string;
  providerAccountId: string;
  /** Email reportado por el proveedor (puede diferir del email de la cuenta). */
  oauthEmail?: string;
}

export interface LinkOAuthInput {
  provider: string;
  providerAccountId: string;
  email?: string;
}

export interface UserRepository {
  getById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByOAuth(
    provider: string,
    providerAccountId: string,
  ): Promise<UserRecord | null>;
  createUserWithOAuth(input: CreateUserWithOAuthInput): Promise<UserRecord>;
  linkOAuth(userId: string, input: LinkOAuthInput): Promise<void>;
  /** Cierra el cliente si el repository es dueño de uno (tests/producción). */
  close?(): Promise<void>;
}

/** Conflicto de unicidad de `users.username` durante el alta. */
export class UsernameTakenError extends Error {
  constructor() {
    super("Username already taken");
    this.name = "UsernameTakenError";
  }
}

/** Conflicto de unicidad de `users.email` durante el alta (carrera). */
export class EmailTakenError extends Error {
  constructor() {
    super("Email already registered");
    this.name = "EmailTakenError";
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

function uniqueViolationConstraint(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { code, constraint } = error as {
    code?: unknown;
    constraint?: unknown;
  };
  if (code !== "23505") return undefined;
  return typeof constraint === "string" ? constraint : "";
}

function translateCreateUserError(error: unknown): unknown {
  const constraint = uniqueViolationConstraint(error);
  if (constraint === undefined) return error;
  if (constraint.includes("username")) return new UsernameTakenError();
  // `ix_users_email` u otra unique del INSERT de users: la única restante es
  // email (el id es un UUID aleatorio y las de oauth_accounts se insertan
  // después, dentro de la misma transacción).
  return new EmailTakenError();
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly client: Queryable | null) {}

  private get db(): Queryable {
    if (!this.client) {
      throw new Error(
        "Database is not configured: bind HYPERDRIVE or set DATABASE_URL",
      );
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

  async findByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.rows<UserRecord>(
      `SELECT ${USER_COLUMNS_QUALIFIED}
         FROM users u
        WHERE lower(u.email) = $1
        LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findByOAuth(
    provider: string,
    providerAccountId: string,
  ): Promise<UserRecord | null> {
    const rows = await this.rows<UserRecord>(
      `SELECT ${USER_COLUMNS_QUALIFIED}
         FROM users u
         JOIN oauth_accounts o ON o.user_id = u.id
        WHERE o.provider = $1
          AND o.provider_account_id = $2
        LIMIT 1`,
      [provider, providerAccountId],
    );
    return rows[0] ?? null;
  }

  async createUserWithOAuth(
    input: CreateUserWithOAuthInput,
  ): Promise<UserRecord> {
    const db = this.db;
    const userId = crypto.randomUUID();
    const oauthId = crypto.randomUUID();

    await db.query("BEGIN");
    try {
      const inserted = await db.query<UserRecord>(
        `INSERT INTO users (
           id, email, hashed_password, is_active, is_superuser, is_verified,
           role, username, cover_key, total_plays
         )
         VALUES ($1, $2, NULL, TRUE, FALSE, TRUE, NULL, $3, NULL, 0)
         RETURNING ${USER_COLUMNS}`,
        [userId, input.email, input.username],
      );

      await db.query(
        `INSERT INTO oauth_accounts (
           id, user_id, provider, provider_account_id, email, created_at
         )
         VALUES ($1, $2, $3, $4, $5, now())`,
        [
          oauthId,
          userId,
          input.provider,
          input.providerAccountId,
          input.oauthEmail ?? input.email,
        ],
      );

      await db.query("COMMIT");

      const row = inserted.rows[0];
      if (!row) {
        throw new Error("INSERT users did not return a row");
      }
      return row;
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw translateCreateUserError(error);
    }
  }

  async linkOAuth(userId: string, input: LinkOAuthInput): Promise<void> {
    // Idempotente: si otra request ya linkeó (provider, account) o el usuario
    // ya tenía ese provider, no rompe el login.
    await this.db.query(
      `INSERT INTO oauth_accounts (
         id, user_id, provider, provider_account_id, email, created_at
       )
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT DO NOTHING`,
      [
        crypto.randomUUID(),
        userId,
        input.provider,
        input.providerAccountId,
        input.email ?? null,
      ],
    );
  }
}
