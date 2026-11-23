-- Unicidad de `playlist_songs.position` por playlist (F-hardening)
--
-- El INSERT de `addSongToPlaylist` calculaba `position` con `count(*)`: dos
-- adds concurrentes leían el mismo count y commiteaban dos filas con la misma
-- posición (la PK `(playlist_id, song_id)` solo protege canciones repetidas).
--
-- Antes de crear el unique se renumera TODO el histórico 0..n-1 por playlist,
-- en el mismo idioma que el renumerado del DELETE: el join va por
-- `(playlist_id, song_id)` (solo `song_id` cruzaría canciones homónimas entre
-- playlists y rompería la igualdad de filas del UPDATE).
--
-- El repo reintenta UNA vez el INSERT ante el 23505 de este índice: el segundo
-- intento recalcula el count bajo un snapshot nuevo.

UPDATE "playlist_songs" AS target
SET "position" = ranked.position - 1
FROM (
  SELECT "playlist_id",
         "song_id",
         row_number() OVER (
           PARTITION BY "playlist_id"
           ORDER BY "position", "added_at", "song_id"
         ) AS position
  FROM "playlist_songs"
) AS ranked
WHERE target."playlist_id" = ranked."playlist_id"
  AND target."song_id" = ranked."song_id";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_playlist_songs_position"
  ON "playlist_songs" USING btree ("playlist_id", "position");
