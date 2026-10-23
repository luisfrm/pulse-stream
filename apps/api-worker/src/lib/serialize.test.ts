/**
 * Tests unitarios de los serializadores (sin DB): formatos de fecha, URLs de
 * R2 y la forma exacta de los DTOs.
 */

import { describe, expect, it } from "vitest";

import { createConfig, type Bindings } from "@/env";
import type { AlbumRow, ArtistRow, ListenRow, PlaylistRow, SongRow, UserRow } from "@/db/schema";
import {
  publicUrl,
  toAlbumDto,
  toArtistDto,
  toListenDto,
  toMyPlaylistDto,
  toPydanticDateTime,
  toPlaylistDto,
  toSongDto,
  toSongWithPlaysDto,
  toUserDto,
} from "@/lib/serialize";

const env: Bindings = {
  ENV: "local",
  AUTH_SECRET: "test-secret",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/pulse",
  R2_PUBLIC_BASE_URL: "https://cdn.example.com/",
};
const config = createConfig(env);
const noR2Config = createConfig({ ...env, R2_PUBLIC_BASE_URL: "" });

const createdAt = new Date("2026-10-22T12:34:56.000Z");

const userRow: UserRow = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.com",
  hashedPassword: null,
  isActive: true,
  isSuperuser: false,
  isVerified: false,
  role: null,
  username: "ana",
  coverKey: "covers/aaaaaaaa-1111-4111-8111-111111111111.webp",
  totalPlays: 7,
  name: null,
  createdAt,
  updatedAt: createdAt,
};

const artistRow: ArtistRow = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Daft Punk",
  imageUrl: null,
  coverKey: null,
  createdAt,
  updatedAt: createdAt,
};

const albumRow: AlbumRow = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Discovery",
  artistId: artistRow.id,
  coverKey: "covers/bbbbbbbb-2222-4222-8222-222222222222.webp",
  createdAt,
  updatedAt: createdAt,
};

const songRow: SongRow = {
  id: "44444444-4444-4444-8444-444444444444",
  title: "One More Time",
  artistId: artistRow.id,
  albumId: albumRow.id,
  genres: ["electronic", "pop"],
  lyrics: null,
  objectKey: "audio/one-more-time.mp3",
  durationSeconds: 320,
  playCount: 42,
  createdAt,
  updatedAt: createdAt,
};

describe("toPydanticDateTime", () => {
  it("omite los microsegundos cuando son 0 (estilo pydantic-core)", () => {
    expect(toPydanticDateTime(new Date("2026-10-22T12:34:56.000Z"))).toBe(
      "2026-10-22T12:34:56Z",
    );
  });

  it("usa 6 dígitos cuando hay fracción", () => {
    expect(toPydanticDateTime(new Date("2026-10-22T12:34:56.123Z"))).toBe(
      "2026-10-22T12:34:56.123000Z",
    );
    expect(toPydanticDateTime(new Date("2026-10-22T12:34:56.001Z"))).toBe(
      "2026-10-22T12:34:56.001000Z",
    );
  });
});

describe("publicUrl", () => {
  it("une base y key sin duplicar el slash", () => {
    expect(publicUrl("https://cdn.example.com/", "covers/a.webp")).toBe(
      "https://cdn.example.com/covers/a.webp",
    );
    expect(publicUrl("https://cdn.example.com", "covers/a.webp")).toBe(
      "https://cdn.example.com/covers/a.webp",
    );
  });

  it("devuelve null si falta base o key", () => {
    expect(publicUrl(undefined, "covers/a.webp")).toBeNull();
    expect(publicUrl("https://cdn.example.com", null)).toBeNull();
    expect(publicUrl("", "covers/a.webp")).toBeNull();
  });
});

describe("toUserDto", () => {
  it("expone el shape de UserRead sin created_at", () => {
    expect(toUserDto(userRow, config)).toEqual({
      id: userRow.id,
      email: "ana@example.com",
      is_active: true,
      is_verified: false,
      is_superuser: false,
      role: null,
      username: "ana",
      cover_key: userRow.coverKey,
      cover_url: "https://cdn.example.com/covers/aaaaaaaa-1111-4111-8111-111111111111.webp",
      total_plays: 7,
    });
  });

  it("normaliza roles legacy a null", () => {
    expect(toUserDto({ ...userRow, role: "user" }, config).role).toBeNull();
    expect(toUserDto({ ...userRow, role: "admin" }, config).role).toBe("admin");
  });
});

describe("toArtistDto", () => {
  it("sin R2 configurado el cover_url es null", () => {
    const dto = toArtistDto({ ...artistRow, coverKey: "covers/x.webp" }, noR2Config);
    expect(dto.cover_url).toBeNull();
    expect(dto.cover_key).toBe("covers/x.webp");
    expect(dto.created_at).toBe("2026-10-22T12:34:56Z");
  });
});

describe("toAlbumDto", () => {
  it("owner/artist anidado + song_count por COUNT", () => {
    const dto = toAlbumDto({ ...albumRow, artist: artistRow, songCount: 12 }, config);
    expect(dto.song_count).toBe(12);
    expect(dto.artist.name).toBe("Daft Punk");
    expect(dto.cover_url).toBe(
      "https://cdn.example.com/covers/bbbbbbbb-2222-4222-8222-222222222222.webp",
    );
  });

  it("cae a songs.length cuando no hay COUNT", () => {
    const dto = toAlbumDto(
      { ...albumRow, artist: artistRow, songs: [{ id: "s1" }, { id: "s2" }] },
      config,
    );
    expect(dto.song_count).toBe(2);
  });
});

describe("toSongDto", () => {
  it("hereda el cover del álbum y calcula stream_url", () => {
    const dto = toSongDto(
      {
        ...songRow,
        artist: artistRow,
        album: { ...albumRow, artist: artistRow, songCount: 1 },
        collaborators: [{ ...artistRow, id: "55555555-5555-4555-8555-555555555555", name: "Invité" }],
      },
      config,
    );

    expect(dto.stream_url).toBe("https://cdn.example.com/audio/one-more-time.mp3");
    expect(dto.cover_url).toBe(
      "https://cdn.example.com/covers/bbbbbbbb-2222-4222-8222-222222222222.webp",
    );
    expect(dto.album?.song_count).toBe(1);
    expect(dto.collaborators?.map((a) => a.name)).toEqual(["Invité"]);
    expect(dto.play_count).toBe(42);
    expect(dto.genres).toEqual(["electronic", "pop"]);
  });

  it("sin álbum no hay cover (canción legacy)", () => {
    const dto = toSongDto({ ...songRow, album: null, artist: artistRow }, config);
    expect(dto.album).toBeNull();
    expect(dto.cover_url).toBeNull();
    expect(dto.collaborators).toEqual([]);
  });

  it("toSongWithPlaysDto sobreescribe play_count con la ventana", () => {
    const dto = toSongWithPlaysDto({ ...songRow, artist: artistRow, album: null }, config, 5);
    expect(dto.play_count).toBe(5);
  });
});

describe("playlists", () => {
  const playlistRow: PlaylistRow = {
    id: "66666666-6666-4666-8666-666666666666",
    kind: "user",
    query: null,
    name: "Favoritas",
    description: null,
    coverKey: null,
    isPublic: false,
    ownerId: userRow.id,
    createdAt,
    updatedAt: createdAt,
  };

  it("expone owner_email, song_count y song_ids en orden", () => {
    const dto = toMyPlaylistDto(
      {
        ...playlistRow,
        ownerEmail: "ana@example.com",
        items: [{ songId: "a" }, { songId: "b" }],
      },
      config,
    );

    expect(dto.owner_email).toBe("ana@example.com");
    expect(dto.song_count).toBe(2);
    expect(dto.song_ids).toEqual(["a", "b"]);
    expect(dto.kind).toBe("user");
  });

  it("normaliza kind/query legacy a valores válidos", () => {
    const dto = toPlaylistDto(
      { ...playlistRow, ownerEmail: null, songCount: 0, kind: "raro", query: "otra" },
      config,
    );
    expect(dto.kind).toBe("user");
    expect(dto.query).toBeNull();
  });

  it("mantiene query de snapshot en playlists system", () => {
    const dto = toPlaylistDto(
      {
        ...playlistRow,
        ownerEmail: null,
        songCount: 0,
        kind: "system",
        query: "top_week",
      },
      config,
    );
    expect(dto.kind).toBe("system");
    expect(dto.query).toBe("top_week");
  });
});

describe("toListenDto", () => {
  it("serializa played_at en ISO con Z", () => {
    const row: ListenRow = {
      id: "77777777-7777-4777-8777-777777777777",
      userId: userRow.id,
      songId: songRow.id,
      playedAt: new Date("2026-10-22T12:34:56.500Z"),
    };
    expect(toListenDto(row)).toEqual({
      id: row.id,
      song_id: songRow.id,
      played_at: "2026-10-22T12:34:56.500000Z",
    });
  });
});
