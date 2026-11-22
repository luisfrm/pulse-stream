-- Essentials por artista: FK con ON DELETE CASCADE (F3)
--
-- La 0003 agregó `playlists.artist_id` con `REFERENCES artists(id)` sin acción:
-- borrar un artista con Essentials fallaba con 23503 (500). El resto de las FKs
-- hacia `artists` (albums/songs/song_collaborators) cascadean; esta las iguala.
--
-- No se edita la 0003 (ya aplicada en dev/test). Postgres autogeneró el nombre
-- `playlists_artist_id_fkey` al crear la columna inline; el DROP defensivo cubre
-- también el nombre de Drizzle si alguna base la normalizó distinto.

ALTER TABLE "playlists" DROP CONSTRAINT IF EXISTS "playlists_artist_id_fkey";
--> statement-breakpoint
ALTER TABLE "playlists" DROP CONSTRAINT IF EXISTS "playlists_artist_id_artists_id_fk";
--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_artist_id_artists_id_fk"
  FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE;
