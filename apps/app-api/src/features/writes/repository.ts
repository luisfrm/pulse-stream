import type { QueryResultRow } from "pg";

import type { Queryable } from "../../db/types";
import { utcTimestamp } from "../catalog/queries";
import type { PlaylistKind, PlaylistSystemQuery } from "../catalog/schema";
import type { UserRecord } from "../users/repository";
import { UsernameTakenError } from "../users/repository";

/**
 * Escrituras de la app (Fase 3): favoritos, playlists de usuario,
 * listens/contadores y perfil.
 *
 * Reglas:
 * - SQL parametrizado, nunca interpolación de valores.
 * - Driver local Neon HTTP (`ENV=local`): NO hay transacciones interactivas →
 *   cada mutación multi-tabla es UNA sentencia con CTEs.
 * - Los `DELETE`/`UPDATE` usan `RETURNING` para detectar si tocaron una fila
 *   (el wrapper HTTP de Neon reporta `rowCount` como filas devueltas).
 * - `updated_at = now()` explícito en cada UPDATE (el `onupdate` de
 *   SQLAlchemy no existe en la DB).
 */

export interface ListenRecord extends QueryResultRow {
  id: string;
  song_id: string;
  /** Timestamp UTC sin offset (el mapper agrega la `Z`). */
  played_at: string;
}

export interface CreatePlaylistInput {
  ownerId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  kind: PlaylistKind;
  /** Solo `system` (top_week/top_month/new); `null` en las de usuario. */
  query: PlaylistSystemQuery | null;
}

export interface UpdatePlaylistFields {
  name?: string;
  description?: string | null;
  isPublic?: boolean;
  coverKey?: string | null;
}

export interface UpdateUserProfileFields {
  username?: string;
  coverKey?: string | null;
}

export interface WritesRepository {
  /* Favoritos (idempotentes: `ON CONFLICT DO NOTHING`). */
  addFavoriteSong(userId: string, songId: string): Promise<void>;
  removeFavoriteSong(userId: string, songId: string): Promise<boolean>;
  addFavoriteAlbum(userId: string, albumId: string): Promise<void>;
  removeFavoriteAlbum(userId: string, albumId: string): Promise<boolean>;
  addFavoritePlaylist(userId: string, playlistId: string): Promise<void>;
  removeFavoritePlaylist(userId: string, playlistId: string): Promise<boolean>;

  /* Playlists de usuario. */
  createPlaylist(input: CreatePlaylistInput): Promise<string>;
  updatePlaylist(id: string, fields: UpdatePlaylistFields): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  /** Agrega al final (`max(position)+1`); duplicado = no-op. */
  addPlaylistSong(playlistId: string, songId: string): Promise<boolean>;
  /** Quita y renumera 0..n-1; `false` si la canción no estaba. */
  removePlaylistSong(playlistId: string, songId: string): Promise<boolean>;

  /* Listens + contadores (una sola sentencia con CTEs). */
  recordListen(userId: string, songId: string): Promise<ListenRecord>;

  /* Perfil (username/cover; nunca role/email/password). */
  updateUserProfile(
    userId: string,
    fields: UpdateUserProfileFields,
  ): Promise<UserRecord>;

  /** Cierra el cliente si el repository es dueño de uno (tests/producción). */
  close?(): Promise<void>;
}

/** Columnas de `UserRecord` (espejo de `users/repository.ts`). */
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

const DEDUPE_WINDOW_SECONDS = 30;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

export class PgWritesRepository implements WritesRepository {
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
    values: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.db.query<T>(text, values);
    return result.rows;
  }

  /* ------------------------------ favoritos ------------------------------ */

  async addFavoriteSong(userId: string, songId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO user_favorites (user_id, song_id, created_at)
       VALUES ($1, $2, now())
       ON CONFLICT DO NOTHING`,
      [userId, songId],
    );
  }

  async removeFavoriteSong(userId: string, songId: string): Promise<boolean> {
    const rows = await this.rows(
      `DELETE FROM user_favorites
        WHERE user_id = $1
          AND song_id = $2
      RETURNING 1`,
      [userId, songId],
    );
    return rows.length > 0;
  }

  async addFavoriteAlbum(userId: string, albumId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO user_favorite_albums (user_id, album_id, created_at)
       VALUES ($1, $2, now())
       ON CONFLICT DO NOTHING`,
      [userId, albumId],
    );
  }

  async removeFavoriteAlbum(
    userId: string,
    albumId: string,
  ): Promise<boolean> {
    const rows = await this.rows(
      `DELETE FROM user_favorite_albums
        WHERE user_id = $1
          AND album_id = $2
      RETURNING 1`,
      [userId, albumId],
    );
    return rows.length > 0;
  }

  async addFavoritePlaylist(
    userId: string,
    playlistId: string,
  ): Promise<void> {
    // El like SOLO marca el favorito: nunca toca el contenido de la playlist
    // (las `system` únicamente las muta un admin).
    await this.db.query(
      `INSERT INTO user_favorite_playlists (user_id, playlist_id, created_at)
       VALUES ($1, $2, now())
       ON CONFLICT DO NOTHING`,
      [userId, playlistId],
    );
  }

  async removeFavoritePlaylist(
    userId: string,
    playlistId: string,
  ): Promise<boolean> {
    const rows = await this.rows(
      `DELETE FROM user_favorite_playlists
        WHERE user_id = $1
          AND playlist_id = $2
      RETURNING 1`,
      [userId, playlistId],
    );
    return rows.length > 0;
  }

  /* ------------------------------ playlists ------------------------------ */

  async createPlaylist(input: CreatePlaylistInput): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO playlists (
         id, kind, name, description, is_public, query, owner_id,
         created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
      [
        id,
        input.kind,
        input.name,
        input.description,
        input.isPublic,
        input.query,
        input.ownerId,
      ],
    );
    return id;
  }

  async updatePlaylist(
    id: string,
    fields: UpdatePlaylistFields,
  ): Promise<void> {
    const values: unknown[] = [id];
    const sets: string[] = [];

    const set = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (fields.name !== undefined) set("name", fields.name);
    if (fields.description !== undefined) {
      set("description", fields.description);
    }
    if (fields.isPublic !== undefined) set("is_public", fields.isPublic);
    if (fields.coverKey !== undefined) set("cover_key", fields.coverKey);

    // "Toda UPDATE setea updated_at": el `onupdate` de SQLAlchemy no existe
    // en la DB (AGENTS/docs de la migración).
    sets.push("updated_at = now()");

    await this.db.query(
      `UPDATE playlists
          SET ${sets.join(", ")}
        WHERE id = $1`,
      values,
    );
  }

  async deletePlaylist(id: string): Promise<void> {
    // playlist_songs y user_favorite_playlists caen por ON DELETE CASCADE.
    await this.db.query("DELETE FROM playlists WHERE id = $1", [id]);
  }

  async addPlaylistSong(
    playlistId: string,
    songId: string,
  ): Promise<boolean> {
    const rows = await this.rows<{ inserted_count: number }>(
      `WITH next_position AS (
         SELECT COALESCE(max(item.position) + 1, 0)::int AS position
           FROM playlist_songs item
          WHERE item.playlist_id = $1
       ),
       inserted AS (
         INSERT INTO playlist_songs (
           playlist_id, song_id, position, added_at
         )
         SELECT $1, $2, next_position.position, now()
           FROM next_position
          WHERE EXISTS (SELECT 1 FROM songs WHERE songs.id = $2)
            AND EXISTS (SELECT 1 FROM playlists WHERE playlists.id = $1)
         ON CONFLICT DO NOTHING
         RETURNING 1
       ),
       touched AS (
         UPDATE playlists
            SET updated_at = now()
          WHERE playlists.id = $1
            AND EXISTS (SELECT 1 FROM inserted)
         RETURNING 1
       )
       SELECT count(*)::int AS inserted_count FROM inserted`,
      [playlistId, songId],
    );
    return (rows[0]?.inserted_count ?? 0) > 0;
  }

  async removePlaylistSong(
    playlistId: string,
    songId: string,
  ): Promise<boolean> {
    // Un solo statement (Neon HTTP no tiene transacciones interactivas):
    // - `removed` borra el item;
    // - `renumbered` recalcula 0..n-1 sobre los restantes (excluye $2, así no
    //   compite por la fila borrada) y solo toca las posiciones que cambian;
    // - `touched` bumpea `updated_at` únicamente si el item existía.
    const rows = await this.rows<{ removed_count: number }>(
      `WITH removed AS (
         DELETE FROM playlist_songs
          WHERE playlist_id = $1
            AND song_id = $2
         RETURNING position
       ),
       renumbered AS (
         UPDATE playlist_songs item
            SET position = ordered.position
           FROM (
             SELECT sibling.song_id,
                    (row_number() OVER (
                       ORDER BY sibling.position, sibling.added_at,
                                sibling.song_id
                     ) - 1)::int AS position
               FROM playlist_songs sibling
              WHERE sibling.playlist_id = $1
                AND sibling.song_id <> $2
           ) ordered,
           removed
          WHERE item.playlist_id = $1
            AND item.song_id = ordered.song_id
            AND item.position <> ordered.position
         RETURNING 1
       ),
       touched AS (
         UPDATE playlists
            SET updated_at = now()
          WHERE playlists.id = $1
            AND EXISTS (SELECT 1 FROM removed)
         RETURNING 1
       )
       SELECT count(*)::int AS removed_count FROM removed`,
      [playlistId, songId],
    );
    return (rows[0]?.removed_count ?? 0) > 0;
  }

  /* ------------------------------- listens ------------------------------- */

  async recordListen(userId: string, songId: string): Promise<ListenRecord> {
    // Una sentencia = insert + dedupe + contadores atómicos. Con el driver
    // HTTP no hay transacción interactiva; los CTEs de data-modificación
    // corren en el mismo statement y `inserted` es visible para los UPDATE.
    //
    // Garantía: nunca queda un insert sin sus dos incrementos (ni al revés).
    // No es serializable entre requests concurrentes (dos POST simultáneos
    // del mismo song pueden insertar dos filas, igual que en Python).
    const rows = await this.rows<ListenRecord>(
      `WITH previous AS (
         SELECT listen.id, listen.song_id, listen.played_at
           FROM listens listen
          WHERE listen.user_id = $1
          ORDER BY listen.played_at DESC, listen.id DESC
          LIMIT 1
       ),
       inserted AS (
         INSERT INTO listens (id, user_id, song_id, played_at)
         SELECT $2, $1, $3, now()
          WHERE EXISTS (SELECT 1 FROM songs WHERE songs.id = $3)
            AND NOT EXISTS (
              SELECT 1
                FROM previous
               WHERE previous.song_id = $3
                 AND previous.played_at >
                     now() - interval '${DEDUPE_WINDOW_SECONDS} seconds'
            )
         RETURNING id, song_id, played_at
       ),
       song_increment AS (
         UPDATE songs
            SET play_count = songs.play_count + 1,
                updated_at = now()
          WHERE songs.id = $3
            AND EXISTS (SELECT 1 FROM inserted)
         RETURNING 1
       ),
       user_increment AS (
         UPDATE users
            SET total_plays = users.total_plays + 1,
                updated_at = now()
          WHERE users.id = $1
            AND EXISTS (SELECT 1 FROM inserted)
         RETURNING 1
       )
       SELECT chosen.id,
              chosen.song_id,
              to_json(${utcTimestamp("chosen.played_at")}) AS played_at
         FROM (
           SELECT inserted.id, inserted.song_id, inserted.played_at
             FROM inserted
           UNION ALL
           SELECT previous.id, previous.song_id, previous.played_at
             FROM previous
            WHERE NOT EXISTS (SELECT 1 FROM inserted)
         ) AS chosen
        LIMIT 1`,
      [userId, crypto.randomUUID(), songId],
    );

    const row = rows[0];
    if (!row) {
      throw new Error("recordListen did not return a row");
    }
    return row;
  }

  /* -------------------------------- perfil -------------------------------- */

  async updateUserProfile(
    userId: string,
    fields: UpdateUserProfileFields,
  ): Promise<UserRecord> {
    const values: unknown[] = [userId];
    const sets: string[] = [];
    let usernameGuard = "";

    if (fields.username !== undefined) {
      values.push(fields.username);
      const placeholder = `$${values.length}`;
      sets.push(`username = ${placeholder}`);
      // Unicidad case-insensitive (Python la valida en el UserManager; acá se
      // resuelve en la misma sentencia para no hacer SELECT + UPDATE).
      usernameGuard = `
          AND NOT EXISTS (
            SELECT 1
              FROM users other
             WHERE lower(other.username) = lower(${placeholder})
               AND other.id <> $1
          )`;
    }
    if (fields.coverKey !== undefined) {
      values.push(fields.coverKey);
      sets.push(`cover_key = $${values.length}`);
    }

    sets.push("updated_at = now()");

    try {
      const rows = await this.rows<UserRecord>(
        `UPDATE users
            SET ${sets.join(", ")}
          WHERE users.id = $1${usernameGuard}
        RETURNING ${USER_COLUMNS}`,
        values,
      );

      const row = rows[0];
      if (!row) {
        // El guard de username no matcheó (o el usuario desapareció).
        if (fields.username !== undefined) throw new UsernameTakenError();
        throw new Error(`User ${userId} not found while updating profile`);
      }
      return row;
    } catch (error) {
      // Carrera: otra request tomó el mismo username entre el guard y el
      // UPDATE (el índice único de la DB es case-sensitive).
      if (fields.username !== undefined && isUniqueViolation(error)) {
        throw new UsernameTakenError();
      }
      throw error;
    }
  }
}
