import {
  boolean,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Espejo Drizzle del esquema que sigue siendo propiedad de Alembic
 * (`apps/api/alembic`). Solo modela `users`; el resto se incorporará con
 * `drizzle-kit pull` en fases posteriores.
 *
 * Regla del repo: los enums de dominio (`role`) viven en la capa de validación
 * (Zod), la columna es VARCHAR plano.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  // Nullable por compatibilidad con datos legacy; el alta nueva (panel) siempre
  // setea un hash.
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

export type UserRow = typeof users.$inferSelect;
