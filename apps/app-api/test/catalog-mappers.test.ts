import { describe, expect, it } from "vitest";

import {
  mapAlbum,
  mapArtist,
  mapMyPlaylist,
  mapPlaylist,
  mapPlaylistDetail,
  mapRecentlyPlayed,
  mapSong,
  toIsoDate,
} from "../src/features/catalog/mappers";
import { flagToBool, pageOf, resolveSince } from "../src/features/catalog/service";
import {
  ALBUM_ID,
  ARTIST_ID,
  BASE_URL,
  COLLABORATOR_ID,
  PLAYLIST_ID,
  SONG_ID,
  SONG_ID_2,
  albumRecord,
  artistRecord,
  myPlaylistRecord,
  playlistRecord,
  songRecord,
} from "./catalog-fixtures";

describe("mappers del catálogo", () => {
  it("toIsoDate normaliza a UTC con microsegundos (formato de Python)", () => {
    expect(toIsoDate("2026-08-19T12:34:56.789012")).toBe(
      "2026-08-19T12:34:56.789012Z",
    );
    // Postgres recorta ceros finales; Python emite 6 dígitos.
    expect(toIsoDate("2026-08-22T00:08:09.54825")).toBe(
      "2026-08-22T00:08:09.548250Z",
    );
    // Sin fracción no se agregan ceros.
    expect(toIsoDate("2026-08-20T08:00:00")).toBe("2026-08-20T08:00:00Z");
    // Variantes con offset UTC.
    expect(toIsoDate("2026-08-19 12:34:56+00")).toBe(
      "2026-08-19T12:34:56Z",
    );
    expect(toIsoDate("2026-08-19T12:34:56+00:00")).toBe(
      "2026-08-19T12:34:56Z",
    );
    expect(toIsoDate("2026-08-19T12:34:56Z")).toBe("2026-08-19T12:34:56Z");
    expect(toIsoDate(new Date("2026-08-19T12:34:56.789Z"))).toBe(
      "2026-08-19T12:34:56.789000Z",
    );
  });

  it("mapArtist calcula cover_url con el base de R2 (y null sin base/key)", () => {
    expect(mapArtist(artistRecord(), BASE_URL)).toEqual({
      id: ARTIST_ID,
      name: "Parity Artist",
      image_url: null,
      cover_key: "covers/artist.webp",
      created_at: "2026-08-19T12:34:56.789012Z",
      cover_url: "https://cdn.example.com/covers/artist.webp",
    });

    // Base con slash final + key sin cover → URL normalizada / null.
    expect(
      mapArtist(artistRecord({ cover_key: "covers/x.webp" }), `${BASE_URL}/`)
        .cover_url,
    ).toBe("https://cdn.example.com/covers/x.webp");
    expect(mapArtist(artistRecord({ cover_key: null }), BASE_URL).cover_url)
      .toBeNull();
    expect(
      mapArtist(artistRecord(), "").cover_url,
    ).toBeNull();
  });

  it("mapSong devuelve el shape exacto de SongRead y fuerza song_count 0", () => {
    const song = mapSong(songRecord(), BASE_URL);

    expect(Object.keys(song)).toEqual([
      "id",
      "title",
      "artist",
      "album",
      "genres",
      "lyrics",
      "object_key",
      "duration_seconds",
      "play_count",
      "created_at",
      "stream_url",
      "cover_url",
      "collaborators",
    ]);

    expect(song).toEqual({
      id: SONG_ID,
      title: "Parity Song",
      artist: {
        id: ARTIST_ID,
        name: "Parity Artist",
        image_url: null,
        cover_key: "covers/artist.webp",
        created_at: "2026-08-19T12:34:56.789012Z",
        cover_url: "https://cdn.example.com/covers/artist.webp",
      },
      album: {
        id: ALBUM_ID,
        title: "Parity Album",
        artist: {
          id: ARTIST_ID,
          name: "Parity Artist",
          image_url: null,
          cover_key: "covers/artist.webp",
          created_at: "2026-08-19T12:34:56.789012Z",
          cover_url: "https://cdn.example.com/covers/artist.webp",
        },
        cover_key: "covers/album.webp",
        cover_url: "https://cdn.example.com/covers/album.webp",
        song_count: 0,
        created_at: "2026-08-20T08:00:00Z",
      },
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
          id: COLLABORATOR_ID,
          name: "Guest",
          image_url: null,
          cover_key: "covers/artist.webp",
          created_at: "2026-08-19T12:34:56.789012Z",
          cover_url: "https://cdn.example.com/covers/artist.webp",
        },
      ],
    });
  });

  it("mapSong sin álbum (legacy) deja cover_url null y acepta override de play_count", () => {
    const song = mapSong(
      songRecord({ album: null, collaborators: null, genres: null }),
      BASE_URL,
      { play_count: 9 },
    );

    expect(song.album).toBeNull();
    expect(song.cover_url).toBeNull();
    expect(song.collaborators).toEqual([]);
    expect(song.genres).toEqual([]);
    expect(song.play_count).toBe(9);
  });

  it("mapSong con álbum explícito usa el song_count real (detalle de álbum)", () => {
    const album = mapAlbum(albumRecord({ song_count: 13 }), BASE_URL);
    const song = mapSong(songRecord(), BASE_URL, { album });

    expect(song.album?.song_count).toBe(13);
    expect(song.cover_url).toBe("https://cdn.example.com/covers/album.webp");
  });

  it("sin R2_PUBLIC_BASE_URL no hay stream_url ni cover_url", () => {
    const song = mapSong(songRecord(), "");

    expect(song.stream_url).toBeNull();
    expect(song.cover_url).toBeNull();
    expect(song.artist.cover_url).toBeNull();
    expect(song.collaborators[0]?.cover_url).toBeNull();
  });

  it("mapAlbum conserva el song_count del row", () => {
    expect(mapAlbum(albumRecord(), BASE_URL)).toEqual({
      id: ALBUM_ID,
      title: "Parity Album",
      artist: {
        id: ARTIST_ID,
        name: "Parity Artist",
        image_url: null,
        cover_key: "covers/artist.webp",
        created_at: "2026-08-19T12:34:56.789012Z",
        cover_url: "https://cdn.example.com/covers/artist.webp",
      },
      cover_key: "covers/album.webp",
      cover_url: "https://cdn.example.com/covers/album.webp",
      song_count: 13,
      created_at: "2026-08-20T08:00:00Z",
    });
  });

  it("mapPlaylist normaliza kind/query y calcula cover_url", () => {
    expect(mapPlaylist(playlistRecord(), BASE_URL)).toEqual({
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
    });

    const system = mapPlaylist(
      playlistRecord({
        kind: "system",
        query: "top_week",
        cover_key: null,
        owner_email: null,
      }),
      BASE_URL,
    );
    expect(system.kind).toBe("system");
    expect(system.query).toBe("top_week");
    expect(system.cover_url).toBeNull();
    expect(system.owner_email).toBeNull();

    // Cualquier valor legacy de `kind` se coerce a "user".
    expect(
      mapPlaylist(playlistRecord({ kind: "weird" as never }), BASE_URL).kind,
    ).toBe("user");
  });

  it("mapMyPlaylist expone song_ids (orden de position) sin songs", () => {
    const playlist = mapMyPlaylist(myPlaylistRecord(), BASE_URL);

    expect(playlist.song_ids).toEqual([SONG_ID, SONG_ID_2]);
    expect(playlist).not.toHaveProperty("songs");
  });

  it("mapPlaylistDetail anida las canciones en el orden recibido", () => {
    const detail = mapPlaylistDetail(
      playlistRecord(),
      [
        songRecord({ id: SONG_ID }),
        songRecord({ id: SONG_ID_2, album: null }),
      ],
      BASE_URL,
    );

    expect(detail.songs.map((song) => song.id)).toEqual([SONG_ID, SONG_ID_2]);
    expect(detail.songs[0]?.album?.song_count).toBe(0);
    expect(detail.songs[1]?.album).toBeNull();
  });

  it("mapRecentlyPlayed agrega user_play_count al SongRead", () => {
    const song = mapRecentlyPlayed(
      { ...songRecord(), user_play_count: 7 },
      BASE_URL,
    );

    expect(song.user_play_count).toBe(7);
    expect(song.id).toBe(SONG_ID);
    expect(song.stream_url).toBe("https://cdn.example.com/audio/parity.mp3");
  });
});

describe("reglas de paginación y ventanas", () => {
  it("pageOf arma el Page<T> de Python", () => {
    expect(pageOf([1, 2], 10, 2, 2)).toEqual({
      items: [1, 2],
      total: 10,
      offset: 2,
      limit: 2,
    });
  });

  it("flagToBool acepta true/false/1/0 y respeta el default", () => {
    expect(flagToBool("true", false)).toBe(true);
    expect(flagToBool("1", false)).toBe(true);
    expect(flagToBool("false", true)).toBe(false);
    expect(flagToBool("0", true)).toBe(false);
    expect(flagToBool(undefined, true)).toBe(true);
    expect(flagToBool(undefined, false)).toBe(false);
  });

  it("resolveSince usa la ventana móvil de días", () => {
    const now = new Date("2026-10-21T15:30:45.123Z");
    expect(resolveSince(7, false, now).toISOString()).toBe(
      "2026-10-14T15:30:45.123Z",
    );
  });

  it("resolveSince con month usa el primer día del mes calendario UTC", () => {
    const now = new Date("2026-10-21T15:30:45.123Z");
    expect(resolveSince(30, true, now).toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );

    const january = new Date("2026-01-31T23:59:59.999Z");
    expect(resolveSince(1, true, january).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});
