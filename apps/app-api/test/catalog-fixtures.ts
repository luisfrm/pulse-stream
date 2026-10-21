import type {
  AlbumRecord,
  ArtistRecord,
  MyPlaylistRecord,
  PlaylistRecord,
  SongRecord,
} from "../src/features/catalog/repository";

/**
 * Fixtures con UUIDs válidos (v4/variant 8) y timestamps con microsegundos,
 * como los devuelve Postgres vía `to_json(... AT TIME ZONE 'UTC')`.
 */

export const ARTIST_ID = "a1111111-1111-4111-8111-111111111111";
export const COLLABORATOR_ID = "a2222222-2222-4222-8222-222222222222";
export const ALBUM_ID = "b1111111-1111-4111-8111-111111111111";
export const SONG_ID = "c1111111-1111-4111-8111-111111111111";
export const SONG_ID_2 = "c2222222-2222-4222-8222-222222222222";
export const PLAYLIST_ID = "e1111111-1111-4111-8111-111111111111";
export const OTHER_PLAYLIST_ID = "e2222222-2222-4222-8222-222222222222";

export const BASE_URL = "https://cdn.example.com";

export function artistRecord(
  overrides: Partial<ArtistRecord> = {},
): ArtistRecord {
  return {
    id: ARTIST_ID,
    name: "Parity Artist",
    image_url: null,
    cover_key: "covers/artist.webp",
    created_at: "2026-08-19T12:34:56.789012",
    ...overrides,
  };
}

export function albumRecord(overrides: Partial<AlbumRecord> = {}): AlbumRecord {
  return {
    id: ALBUM_ID,
    title: "Parity Album",
    artist: artistRecord(),
    cover_key: "covers/album.webp",
    created_at: "2026-08-20T08:00:00",
    song_count: 13,
    ...overrides,
  };
}

export function songRecord(overrides: Partial<SongRecord> = {}): SongRecord {
  return {
    id: SONG_ID,
    title: "Parity Song",
    artist: artistRecord(),
    // El álbum anidado en una canción siempre viene con song_count 0.
    album: albumRecord({ song_count: 0 }),
    genres: ["pop", "indie"],
    lyrics: "la la la",
    object_key: "audio/parity.mp3",
    duration_seconds: 213,
    play_count: 4,
    created_at: "2026-08-21T10:11:12.345678",
    collaborators: [artistRecord({ id: COLLABORATOR_ID, name: "Guest" })],
    ...overrides,
  };
}

export function playlistRecord(
  overrides: Partial<PlaylistRecord> = {},
): PlaylistRecord {
  return {
    id: PLAYLIST_ID,
    kind: "user",
    name: "Parity Mix",
    description: "dos canciones",
    is_public: true,
    cover_key: "covers/playlist.webp",
    query: null,
    owner_id: "ad26a7b7-2d81-44ad-b905-d97a1e174ba8",
    created_at: "2026-08-22T09:00:00",
    owner_email: "parity@pulse.example.com",
    song_count: 2,
    ...overrides,
  };
}

export function myPlaylistRecord(
  overrides: Partial<MyPlaylistRecord> = {},
): MyPlaylistRecord {
  return {
    ...playlistRecord(),
    song_ids: [SONG_ID, SONG_ID_2],
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Contratos esperados (lo que devuelve la API)                               */
/* -------------------------------------------------------------------------- */

export const ARTIST_READ = {
  id: ARTIST_ID,
  name: "Parity Artist",
  image_url: null,
  cover_key: "covers/artist.webp",
  created_at: "2026-08-19T12:34:56.789012Z",
  cover_url: "https://cdn.example.com/covers/artist.webp",
};

export const ALBUM_READ = {
  id: ALBUM_ID,
  title: "Parity Album",
  artist: ARTIST_READ,
  cover_key: "covers/album.webp",
  cover_url: "https://cdn.example.com/covers/album.webp",
  song_count: 13,
  created_at: "2026-08-20T08:00:00Z",
};

export const SONG_READ = {
  id: SONG_ID,
  title: "Parity Song",
  artist: ARTIST_READ,
  album: { ...ALBUM_READ, song_count: 0 },
  genres: ["pop", "indie"],
  lyrics: "la la la",
  object_key: "audio/parity.mp3",
  duration_seconds: 213,
  play_count: 4,
  created_at: "2026-08-21T10:11:12.345678Z",
  stream_url: "https://cdn.example.com/audio/parity.mp3",
  cover_url: "https://cdn.example.com/covers/album.webp",
  collaborators: [
    {
      ...ARTIST_READ,
      id: COLLABORATOR_ID,
      name: "Guest",
    },
  ],
};

export const PLAYLIST_READ = {
  id: PLAYLIST_ID,
  kind: "user",
  name: "Parity Mix",
  description: "dos canciones",
  is_public: true,
  cover_key: "covers/playlist.webp",
  cover_url: "https://cdn.example.com/covers/playlist.webp",
  song_count: 2,
  query: null,
  owner_email: "parity@pulse.example.com",
  created_at: "2026-08-22T09:00:00Z",
};
