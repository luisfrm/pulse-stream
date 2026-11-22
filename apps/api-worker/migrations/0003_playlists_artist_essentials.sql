-- Essentials por artista (playlists editoriales, F3)
--
-- Hand-written (drizzle-kit generate no conoce el esquema previo de Alembic).
-- Aditiva: agrega `playlists.artist_id` (NULL para el resto de las playlists)
-- y el índice parcial que garantiza UNA sola Essentials por artista.
--
-- `playlists.query` es VARCHAR plano (regla de enums en zod): el valor
-- `artist_top` NO necesita migración, solo el índice condicional. El índice es
-- la garantía atómica de "una por artista" ante requests concurrentes; el
-- service igual devuelve 409 amable cuando choca.

ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "artist_id" uuid REFERENCES "artists"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_playlists_essentials_artist"
  ON "playlists" USING btree ("artist_id")
  WHERE "query" = 'artist_top' AND "kind" = 'system';
