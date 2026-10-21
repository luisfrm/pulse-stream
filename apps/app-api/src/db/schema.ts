import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Espejo Drizzle del esquema que sigue siendo propiedad de Alembic
 * (`apps/api/alembic`). Fase 0 solo modela `users` + `oauth_accounts`; el resto
 * se incorporará con `drizzle-kit pull` en fases posteriores.
 *
 * Regla del repo: los enums de dominio (`role`) viven en la capa de validación
 * (Zod), la columna es VARCHAR plano.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  // NULL = cuenta OAuth (Google) sin password local.
  hashedPassword: varchar("hashed_password", { length: 1024 }),
  isActive: boolean("is_active").notNull().default(true),
  isSuperuser: boolean("is_superuser").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  role: varchar("role", { length: 20 }),
  username: varchar("username", { length: 50 }).unique(),
  coverKey: varchar("cover_key", { length: 1024 }),
  totalPlays: integer("total_plays").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).notNull(),
    providerAccountId: varchar("provider_account_id", {
      length: 255,
    }).notNull(),
    email: varchar("email", { length: 320 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_oauth_accounts_provider_account").on(
      table.provider,
      table.providerAccountId,
    ),
    unique("uq_oauth_accounts_user_provider").on(table.userId, table.provider),
    index("ix_oauth_accounts_user_id").on(table.userId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type OAuthAccountRow = typeof oauthAccounts.$inferSelect;
