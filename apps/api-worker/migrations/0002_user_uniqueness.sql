-- Unicidad de username (case-insensitive) y de credencial por provider.
--
-- Hand-written a partir de lo que propuso `drizzle-kit generate`, con
-- `IF NOT EXISTS` para que sea idempotente en una base compartida (la misma
-- que usa el backend Python).
--
--   * `ux_users_username_lower`: Python validaba la unicidad del username en
--     la capa de aplicación (`lower(username) = lower($1)`) y dos requests
--     concurrentes podían pasar el chequeo. El índice la garantiza en la DB.
--     `lower(NULL)` es NULL y los NULL no colisionan: los usuarios sin
--     username siguen siendo válidos.
--   * `ux_account_user_provider`: una sola credencial por usuario y provider;
--     es el target del `ON CONFLICT (user_id, provider_id)` de
--     `setUserPassword`.
--
-- ANTES de aplicar esto, `scripts/migrate.ts` aborta si ya hay usernames
-- duplicados (crear el índice fallaría a mitad de camino).

CREATE UNIQUE INDEX IF NOT EXISTS "ux_users_username_lower" ON "users" USING btree (lower("username"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_account_user_provider" ON "account" USING btree ("user_id","provider_id");
