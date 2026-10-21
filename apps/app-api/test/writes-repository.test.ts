import { describe, expect, it } from "vitest";

import { PgWritesRepository } from "../src/features/writes/repository";
import { ALBUM_ID, PLAYLIST_ID, SONG_ID } from "./catalog-fixtures";
import { TEST_USER_ID } from "./helpers";

class FakeQueryable {
  calls: Array<{ text: string; values?: unknown[] }> = [];

  constructor(private readonly rows: unknown[] = []) {}

  async query<T>(text: string, values?: unknown[]) {
    this.calls.push({ text, values });
    return {
      rows: this.rows as T[],
      rowCount: this.rows.length,
      command: "SELECT",
      oid: 0,
      fields: [],
    };
  }
}

describe("PgWritesRepository — SQL crítico", () => {
  it("recordListen: dedupe 30 s + contadores en una sola sentencia", async () => {
    const db = new FakeQueryable([
      {
        id: "f1111111-1111-4111-8111-111111111111",
        song_id: SONG_ID,
        played_at: "2026-10-21T10:11:12.345678",
      },
    ]);
    const repository = new PgWritesRepository(db);

    await repository.recordListen(TEST_USER_ID, SONG_ID);

    const sql = db.calls[0]!.text;
    expect(sql).toContain("interval '30 seconds'");
    expect(sql).toContain("UPDATE songs");
    expect(sql).toContain("play_count = songs.play_count + 1");
    expect(sql).toContain("UPDATE users");
    expect(sql).toContain("total_plays = users.total_plays + 1");
    expect(sql).toContain("INSERT INTO listens");
    expect(db.calls[0]!.values?.[0]).toBe(TEST_USER_ID);
    expect(db.calls[0]!.values?.[2]).toBe(SONG_ID);
  });

  it("addPlaylistSong: posición max+1 y ON CONFLICT DO NOTHING", async () => {
    const db = new FakeQueryable([{ inserted_count: 1 }]);
    const repository = new PgWritesRepository(db);

    const inserted = await repository.addPlaylistSong(PLAYLIST_ID, SONG_ID);

    const sql = db.calls[0]!.text;
    expect(sql).toContain("COALESCE(max(item.position) + 1, 0)");
    expect(sql).toContain("ON CONFLICT DO NOTHING");
    expect(sql).toContain("updated_at = now()");
    expect(inserted).toBe(true);
  });

  it("removePlaylistSong: delete + renumber 0..n-1 + updated_at", async () => {
    const db = new FakeQueryable([{ removed_count: 1 }]);
    const repository = new PgWritesRepository(db);

    const removed = await repository.removePlaylistSong(PLAYLIST_ID, SONG_ID);

    const sql = db.calls[0]!.text;
    expect(sql).toContain("DELETE FROM playlist_songs");
    expect(sql).toContain("row_number() OVER");
    expect(sql).toContain("- 1)::int AS position");
    expect(sql).toContain("updated_at = now()");
    expect(removed).toBe(true);
  });

  it("updateUserProfile: unicidad case-insensitive y updated_at", async () => {
    const db = new FakeQueryable([
      {
        id: TEST_USER_ID,
        email: "user@example.com",
        hashed_password: null,
        is_active: true,
        is_superuser: false,
        is_verified: true,
        role: null,
        username: "nuevo",
        cover_key: null,
        total_plays: 0,
      },
    ]);
    const repository = new PgWritesRepository(db);

    const user = await repository.updateUserProfile(TEST_USER_ID, {
      username: "nuevo",
    });

    const sql = db.calls[0]!.text;
    expect(sql).toContain("lower(other.username) = lower($2)");
    expect(sql).toContain("updated_at = now()");
    expect(user.username).toBe("nuevo");
  });

  it("createPlaylist y updatePlaylist setean updated_at", async () => {
    const db = new FakeQueryable([{ id: PLAYLIST_ID }]);
    const repository = new PgWritesRepository(db);

    await repository.createPlaylist({
      ownerId: TEST_USER_ID,
      name: "x",
      description: null,
      isPublic: true,
      kind: "user",
      query: null,
    });
    await repository.updatePlaylist(PLAYLIST_ID, { name: "y", isPublic: false });

    expect(db.calls[0]!.text).toContain("INSERT INTO playlists");
    expect(db.calls[1]!.text).toContain("updated_at = now()");
    expect(db.calls[1]!.values).toEqual([PLAYLIST_ID, "y", false]);
  });

  it("favoritos: INSERT ON CONFLICT DO NOTHING y DELETE RETURNING", async () => {
    const db = new FakeQueryable([{ "?column?": 1 }]);
    const repository = new PgWritesRepository(db);

    await repository.addFavoriteSong(TEST_USER_ID, SONG_ID);
    await repository.removeFavoriteSong(TEST_USER_ID, SONG_ID);
    await repository.addFavoriteAlbum(TEST_USER_ID, ALBUM_ID);
    await repository.removeFavoriteAlbum(TEST_USER_ID, ALBUM_ID);

    expect(db.calls[0]!.text).toContain("ON CONFLICT DO NOTHING");
    expect(db.calls[1]!.text).toContain("RETURNING 1");
    expect(db.calls[2]!.text).toContain("user_favorite_albums");
    expect(db.calls[3]!.text).toContain("DELETE FROM user_favorite_albums");
  });
});
