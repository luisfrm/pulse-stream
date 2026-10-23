/**
 * Esquema Drizzle del Worker.
 *
 * Espeja la base que ya usa el backend Python (Alembic 0001..0009), con las
 * mismas columnas snake_case, nullability, FKs e índices. Cambios respecto de
 * ese esquema (migración `0001_better_auth.sql`):
 *   - `users.hashed_password` pasa a nullable (las passwords legacy argon2 no
 *     se migran: se resetean out-of-band).
 *   - `users.name` nuevo (campo que usa better-auth).
 *   - tablas de better-auth (`session`, `account`, `verification`, `rate_limit`)
 *     y `rate_limits` propia para límites no-auth.
 *
 * Regla del proyecto: los enums viven en zod, nunca en la DB (columnas
 * VARCHAR/JSON planas).
 *
 * Los `id` NO llevan `defaultRandom()`: Alembic no creó server defaults y el
 * backend Python siempre genera el uuid en la aplicación. Mantenerlo acá haría
 * que `db:generate` proponga `SET DEFAULT` sobre la base compartida.
 */

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

// --- Catálogo / dominio -----------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    hashedPassword: varchar("hashed_password", { length: 1024 }),
    isActive: boolean("is_active").notNull().default(true),
    isSuperuser: boolean("is_superuser").notNull().default(false),
    isVerified: boolean("is_verified").notNull().default(false),
    // NULL = usuario normal; "admin" = panel. Validado en zod, no en la DB.
    role: varchar("role", { length: 20 }),
    username: varchar("username", { length: 50 }),
    coverKey: varchar("cover_key", { length: 1024 }),
    totalPlays: integer("total_plays").notNull().default(0),
    /** Campo de perfil de better-auth (display name). */
    name: text("name"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ix_users_email").on(table.email),
    uniqueIndex("ix_users_username").on(table.username),
  ],
);

export const artists = pgTable(
  "artists",
  {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    imageUrl: varchar("image_url", { length: 1024 }),
    coverKey: varchar("cover_key", { length: 1024 }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ix_artists_name").on(table.name)],
);

export const albums = pgTable(
  "albums",
  {
    id: uuid("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    coverKey: varchar("cover_key", { length: 1024 }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("ix_albums_artist_id").on(table.artistId)],
);

export const songs = pgTable(
  "songs",
  {
    id: uuid("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    // SET NULL solo para borrados fuera de la API: el servicio bloquea borrar
    // un álbum con canciones y exige álbum en el alta.
    albumId: uuid("album_id").references(() => albums.id, {
      onDelete: "set null",
    }),
    genres: json("genres").$type<string[]>().notNull().default(sql`'[]'::json`),
    lyrics: text("lyrics"),
    objectKey: varchar("object_key", { length: 1024 }).notNull(),
    durationSeconds: integer("duration_seconds"),
    playCount: integer("play_count").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_songs_object_key").on(table.objectKey),
    index("ix_songs_artist_id").on(table.artistId),
    index("ix_songs_title").on(table.title),
    index("ix_songs_album_id").on(table.albumId),
    index("ix_songs_play_count").on(table.playCount),
  ],
);

export const songCollaborators = pgTable(
  "song_collaborators",
  {
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.songId, table.artistId] }),
    index("ix_song_collaborators_artist_id").on(table.artistId),
  ],
);

export const playlists = pgTable(
  "playlists",
  {
    id: uuid("id").primaryKey(),
    /** "user" | "system" (VARCHAR plano, validado en zod). */
    kind: varchar("kind", { length: 20 }).notNull().default("user"),
    /** Query de snapshot de las playlists system: top_week|top_month|new. */
    query: varchar("query", { length: 20 }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    coverKey: varchar("cover_key", { length: 1024 }),
    isPublic: boolean("is_public").notNull().default(false),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("ix_playlists_owner_id").on(table.ownerId),
    index("ix_playlists_kind").on(table.kind),
  ],
);

export const playlistSongs = pgTable(
  "playlist_songs",
  {
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: timestamptz("added_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.playlistId, table.songId] })],
);

export const userFavorites = pgTable(
  "user_favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.songId] })],
);

export const userFavoritePlaylists = pgTable(
  "user_favorite_playlists",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.playlistId] })],
);

export const userFavoriteAlbums = pgTable(
  "user_favorite_albums",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    albumId: uuid("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.albumId] })],
);

export const listens = pgTable(
  "listens",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    // La migración de Alembic (0005) creó `server_default now()`: el default lo
    // pone Postgres (hora de la transacción), no la aplicación. Se mantiene acá
    // para que `db:generate` no proponga dropearlo.
    playedAt: timestamptz("played_at").notNull().defaultNow(),
  },
  (table) => [
    index("ix_listens_user_id").on(table.userId),
    index("ix_listens_song_id").on(table.songId),
    index("ix_listens_played_at").on(table.playedAt),
  ],
);

// --- better-auth ------------------------------------------------------------
// IDs de better-auth son text; `user_id` es uuid para que la FK encaje con
// `users.id` (Postgres no permite FK text -> uuid).
//
// OJO(better-auth): `users.id` es `uuid`, pero better-auth genera ids `text`
// por defecto (`generateId` propio). Al montar el auth real es OBLIGATORIO
// configurar `advanced.database.generateId = () => crypto.randomUUID()` en
// `betterAuth({...})`; sin eso el INSERT de `user`/`session`/`account` falla
// contra la columna uuid. Mismo recordatorio en `env.ts` y en la migración
// `0001_better_auth.sql`.

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("session_token_unique").on(table.token),
    index("ix_session_user_id").on(table.userId),
  ],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("ix_account_user_id").on(table.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

/** Tabla de rate limiting propia de better-auth. */
export const rateLimit = pgTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull().default(0),
    lastRequest: bigint("last_request", { mode: "number" }).notNull().default(0),
  },
  (table) => [uniqueIndex("rate_limit_key_unique").on(table.key)],
);

/** Rate limiting de la app (login/register/presign) — no es de better-auth. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamptz("window_start").notNull().defaultNow(),
});

// --- Relaciones (Drizzle query API) ----------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  playlists: many(playlists),
  favorites: many(userFavorites),
  favoritePlaylists: many(userFavoritePlaylists),
  favoriteAlbums: many(userFavoriteAlbums),
  listens: many(listens),
  sessions: many(session),
  accounts: many(account),
}));

export const artistsRelations = relations(artists, ({ many }) => ({
  songs: many(songs),
  albums: many(albums),
  collaborations: many(songCollaborators),
}));

export const albumsRelations = relations(albums, ({ one, many }) => ({
  artist: one(artists, { fields: [albums.artistId], references: [artists.id] }),
  songs: many(songs),
}));

export const songsRelations = relations(songs, ({ one, many }) => ({
  artist: one(artists, { fields: [songs.artistId], references: [artists.id] }),
  album: one(albums, { fields: [songs.albumId], references: [albums.id] }),
  /** N:M canción <-> artista (colaboradores, sin el artista principal). */
  collaborators: many(songCollaborators),
  playlistItems: many(playlistSongs),
  favoritedBy: many(userFavorites),
  listenedBy: many(listens),
}));

export const songCollaboratorsRelations = relations(
  songCollaborators,
  ({ one }) => ({
    song: one(songs, {
      fields: [songCollaborators.songId],
      references: [songs.id],
    }),
    artist: one(artists, {
      fields: [songCollaborators.artistId],
      references: [artists.id],
    }),
  }),
);

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  owner: one(users, { fields: [playlists.ownerId], references: [users.id] }),
  items: many(playlistSongs),
  favoritedBy: many(userFavoritePlaylists),
}));

export const playlistSongsRelations = relations(playlistSongs, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistSongs.playlistId],
    references: [playlists.id],
  }),
  song: one(songs, {
    fields: [playlistSongs.songId],
    references: [songs.id],
  }),
}));

export const listensRelations = relations(listens, ({ one }) => ({
  user: one(users, { fields: [listens.userId], references: [users.id] }),
  song: one(songs, { fields: [listens.songId], references: [songs.id] }),
}));

// Cara inversa de las tablas de favoritos y de better-auth: sin el `one()`
// acá, `db.query.users.findMany({ with: { favorites: ... } })` no puede anidar
// el item (song/playlist/album) ni la sesión/cuenta.

export const userFavoritesRelations = relations(userFavorites, ({ one }) => ({
  user: one(users, { fields: [userFavorites.userId], references: [users.id] }),
  song: one(songs, { fields: [userFavorites.songId], references: [songs.id] }),
}));

export const userFavoritePlaylistsRelations = relations(
  userFavoritePlaylists,
  ({ one }) => ({
    user: one(users, {
      fields: [userFavoritePlaylists.userId],
      references: [users.id],
    }),
    playlist: one(playlists, {
      fields: [userFavoritePlaylists.playlistId],
      references: [playlists.id],
    }),
  }),
);

export const userFavoriteAlbumsRelations = relations(
  userFavoriteAlbums,
  ({ one }) => ({
    user: one(users, {
      fields: [userFavoriteAlbums.userId],
      references: [users.id],
    }),
    album: one(albums, {
      fields: [userFavoriteAlbums.albumId],
      references: [albums.id],
    }),
  }),
);

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(users, { fields: [session.userId], references: [users.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(users, { fields: [account.userId], references: [users.id] }),
}));

// --- Tipos de fila ----------------------------------------------------------

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type ArtistRow = typeof artists.$inferSelect;
export type NewArtistRow = typeof artists.$inferInsert;
export type AlbumRow = typeof albums.$inferSelect;
export type NewAlbumRow = typeof albums.$inferInsert;
export type SongRow = typeof songs.$inferSelect;
export type NewSongRow = typeof songs.$inferInsert;
export type SongCollaboratorRow = typeof songCollaborators.$inferSelect;
export type PlaylistRow = typeof playlists.$inferSelect;
export type NewPlaylistRow = typeof playlists.$inferInsert;
export type PlaylistSongRow = typeof playlistSongs.$inferSelect;
export type UserFavoriteRow = typeof userFavorites.$inferSelect;
export type UserFavoritePlaylistRow = typeof userFavoritePlaylists.$inferSelect;
export type UserFavoriteAlbumRow = typeof userFavoriteAlbums.$inferSelect;
export type ListenRow = typeof listens.$inferSelect;
export type NewListenRow = typeof listens.$inferInsert;
export type SessionRow = typeof session.$inferSelect;
export type AccountRow = typeof account.$inferSelect;
export type VerificationRow = typeof verification.$inferSelect;
export type RateLimitRow = typeof rateLimits.$inferSelect;
