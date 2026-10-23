-- better-auth: sesiones propias del Worker + name en users
--
-- Hand-written (drizzle-kit generate no conoce el esquema previo de Alembic).
-- No toca columnas existentes salvo:
--   * users.hashed_password -> nullable (las passwords argon2 legacy NO se
--     migran: las cuentas se resetean out-of-band).
--   * users.is_active/is_superuser/is_verified -> server defaults (los valores
--     por fila ya existen).
--   * users.name (campo de perfil de better-auth).
-- No se borra ninguna columna ni tabla del backend Python.
--
-- OJO(better-auth): `users.id` es `uuid`, así que al montar better-auth hay
-- que configurar `advanced.database.generateId = () => crypto.randomUUID()`.
-- Su generador por defecto emite ids `text` y el INSERT contra la columna uuid
-- fallaría (mismo motivo por el que `session.user_id`/`account.user_id` son
-- uuid y no text). Ver `src/db/schema.ts` y el TODO de `src/env.ts`.

ALTER TABLE "users" ALTER COLUMN "hashed_password" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_active" SET DEFAULT true;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_superuser" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_verified" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "token" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" uuid NOT NULL,
  CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_unique" ON "session" USING btree ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_session_user_id" ON "session" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp with time zone,
  "refresh_token_expires_at" timestamp with time zone,
  "scope" text,
  "password" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_account_user_id" ON "account" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "last_request" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limit_key_unique" ON "rate_limit" USING btree ("key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" text PRIMARY KEY NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "window_start" timestamp with time zone DEFAULT now() NOT NULL
);
