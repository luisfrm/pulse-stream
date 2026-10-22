import type { QueryResult, QueryResultRow } from "../src/db/types";
import { describe, expect, it } from "vitest";

import type { Queryable } from "../src/db/types";
import { PgCatalogRepository } from "../src/features/catalog/repository";
import {
  ALBUM_ID,
  COLLABORATOR_ID,
  PLAYLIST_ID,
  SONG_ID,
  albumRecord,
  myPlaylistRecord,
  songRecord,
} from "./catalog-fixtures";
import { TEST_USER_ID } from "./helpers";

interface Call {
  text: string;
  values: unknown[];
}

/** Registra el SQL emitido y responde con filas fijas (sin DB). */
class FakeQueryable implements Queryable {
  readonly calls: Call[] = [];

  constructor(
    private readonly responder: (
      text: string,
      values: unknown[],
    ) => unknown[] = () => [],
  ) {}

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    this.calls.push({ text, values: values ?? [] });
    const rows = this.responder(text, values ?? []);

    return {
      rowCount: rows.length,
      rows: rows as unknown as T[],
    };
  }
}

function isCountQuery(text: string): boolean {
  return text.includes("count(*)::int AS total");
}

describe("PgCatalogRepository — SQL de /songs", () => {
  it("collaborator_id excluye al artista principal y no usa DISTINCT", async () => {
    const db = new FakeQueryable((text) =>
      isCountQuery(text) ? [{ total: 1 }] : [songRecord()],
    );
    const repository = new PgCatalogRepository(db);

    const result = await repository.listSongs({
      offset: 0,
      limit: 10,
      collaboratorId: COLLABORATOR_ID,
    });

    expect(result).toEqual({ items: [songRecord()], total: 1 });
    expect(db.calls).toHaveLength(2);

    const itemsSql = db.calls[0]!.text;
    expect(itemsSql).toContain(
      "JOIN song_collaborators filter_collaborator",
    );
    // Mismo placeholder para el colaborador y la exclusión del principal.
    expect(itemsSql).toContain("filter_collaborator.artist_id = $1");
    expect(itemsSql).toContain("s.artist_id <> $1");
    expect(itemsSql).not.toContain("DISTINCT");
    expect(db.calls[0]!.values).toEqual([COLLABORATOR_ID, 10, 0]);
    expect(db.calls[1]!.values).toEqual([COLLABORATOR_ID]);
  });

  it("playlist_id ordena por position; sin playlist, por created_at desc", async () => {
    const db = new FakeQueryable(() => []);
    const repository = new PgCatalogRepository(db);

    await repository.listSongs({
      offset: 0,
      limit: 10,
      playlistId: PLAYLIST_ID,
    });
    expect(db.calls[0]!.text).toContain("ORDER BY filter_playlist.position ASC");
    expect(db.calls[0]!.text).toContain(
      "JOIN playlist_songs filter_playlist",
    );

    db.calls.length = 0;
    await repository.listSongs({ offset: 0, limit: 10 });
    expect(db.calls[0]!.text).toContain(
      "ORDER BY s.created_at DESC, s.title ASC, s.id ASC",
    );
    expect(db.calls[0]!.text).not.toContain("filter_playlist");
  });

  it("combina q/artist_id/album_id en el WHERE y el OFFSET/LIMIT paramétrico", async () => {
    const db = new FakeQueryable(() => []);
    const repository = new PgCatalogRepository(db);

    await repository.listSongs({
      offset: 5,
      limit: 25,
      search: "parity",
      artistId: "a1111111-1111-4111-8111-111111111111",
      albumId: ALBUM_ID,
    });

    const itemsSql = db.calls[0]!.text;
    expect(itemsSql).toContain("s.title ILIKE $1");
    expect(itemsSql).toContain("s.artist_id = $2");
    expect(itemsSql).toContain("s.album_id = $3");
    expect(itemsSql).toContain("LIMIT $4 OFFSET $5");
    expect(db.calls[0]!.values).toEqual([
      "%parity%",
      "a1111111-1111-4111-8111-111111111111",
      ALBUM_ID,
      25,
      5,
    ]);
  });

  it("getSongById parametriza el id", async () => {
    const db = new FakeQueryable(() => [songRecord()]);
    const repository = new PgCatalogRepository(db);

    await expect(repository.getSongById(SONG_ID)).resolves.toEqual(
      songRecord(),
    );
    expect(db.calls[0]!.values).toEqual([SONG_ID]);
    expect(db.calls[0]!.text).toContain("WHERE s.id = $1");
  });
});

describe("PgCatalogRepository — rankings", () => {
  it("popular: ranking por ventana en una sola query", async () => {
    const db = new FakeQueryable(() => [
      { ...songRecord(), window_play_count: 5 },
    ]);
    const repository = new PgCatalogRepository(db);
    const since = "2026-10-01T00:00:00.000Z";

    const rows = await repository.listPopularSongs({ since, limit: 3 });

    expect(rows[0]?.window_play_count).toBe(5);
    expect(db.calls).toHaveLength(1);
    const sql = db.calls[0]!.text;
    expect(sql).toContain("GROUP BY listens.song_id");
    expect(sql).toContain("ORDER BY plays DESC");
    expect(sql).toContain("listens.played_at >= $1");
    expect(db.calls[0]!.values).toEqual([since, 3]);
  });

  it("recientes: count distinct + página con user_play_count", async () => {
    const db = new FakeQueryable((text) =>
      text.includes("count(DISTINCT listen.song_id)")
        ? [{ total: 2 }]
        : [{ ...songRecord(), user_play_count: 4 }],
    );
    const repository = new PgCatalogRepository(db);

    const result = await repository.listRecentlyPlayed({
      userId: TEST_USER_ID,
      offset: 10,
      limit: 5,
    });

    expect(result.total).toBe(2);
    expect(result.items[0]?.user_play_count).toBe(4);
    expect(db.calls).toHaveLength(2);
    expect(db.calls[1]!.values).toEqual([TEST_USER_ID, 5, 10]);
    const pageSql = db.calls[1]!.text;
    expect(pageSql).toContain("WITH page AS");
    expect(pageSql).toContain("GROUP BY listen.song_id");
    expect(pageSql).toContain("ORDER BY played_at DESC");
    expect(pageSql).toContain(
      "ORDER BY page.played_at DESC, s.id ASC",
    );
  });
});

describe("PgCatalogRepository — álbumes, artistas y playlists", () => {
  it("getAlbumWithSongs usa 2 queries y ordena canciones por título/id (estable)", async () => {
    const db = new FakeQueryable((text) =>
      text.includes("FROM albums a")
        ? [albumRecord({ song_count: 13 })]
        : [songRecord()],
    );
    const repository = new PgCatalogRepository(db);

    const detail = await repository.getAlbumWithSongs(ALBUM_ID);

    expect(detail?.album.song_count).toBe(13);
    expect(detail?.songs).toEqual([songRecord()]);
    expect(db.calls).toHaveLength(2);
    expect(db.calls[1]!.text).toContain("ORDER BY s.title ASC, s.id ASC");
    expect(db.calls[1]!.values).toEqual([ALBUM_ID]);
  });

  it("listAlbums cuenta canciones con LEFT JOIN + GROUP BY", async () => {
    const db = new FakeQueryable((text) =>
      isCountQuery(text) ? [{ total: 1 }] : [albumRecord()],
    );
    const repository = new PgCatalogRepository(db);

    const result = await repository.listAlbums({ offset: 0, limit: 50 });

    expect(result.total).toBe(1);
    const itemsSql = db.calls[0]!.text;
    expect(itemsSql).toContain("LEFT JOIN songs s ON s.album_id = a.id");
    expect(itemsSql).toContain("GROUP BY a.id, a_artist.id");
    expect(itemsSql).toContain("count(s.id)::int AS song_count");
    expect(itemsSql).toContain("ORDER BY a.created_at DESC");
  });

  it("listMyPlaylists devuelve song_ids en orden de position", async () => {
    const db = new FakeQueryable(() => [myPlaylistRecord()]);
    const repository = new PgCatalogRepository(db);

    const playlists = await repository.listMyPlaylists(TEST_USER_ID);

    expect(playlists).toHaveLength(1);
    const sql = db.calls[0]!.text;
    expect(sql).toContain(
      "json_agg(playlist_item.song_id ORDER BY playlist_item.position)",
    );
    expect(sql).toContain("WHERE p.owner_id = $1");
    expect(db.calls[0]!.values).toEqual([TEST_USER_ID]);
  });

  it("listPublicPlaylists pone las system primero", async () => {
    const db = new FakeQueryable(() => []);
    const repository = new PgCatalogRepository(db);

    await repository.listPublicPlaylists({ offset: 0, limit: 10 });

    const sql = db.calls[0]!.text;
    expect(sql).toContain("WHERE p.is_public");
    expect(sql).toContain("ORDER BY (p.kind <> 'system') ASC");
    // El email del usuario de sistema no se expone en playlists system.
    expect(sql).toContain("WHEN p.kind = 'system' THEN NULL");
    expect(sql).not.toContain("playlist_owner.email AS owner_email");
    expect(db.calls[0]!.values).toEqual([10, 0]);
  });
});

describe("PgCatalogRepository — biblioteca", () => {
  it("getLibraryIds devuelve los 3 sets ya ordenados", async () => {
    const db = new FakeQueryable(() => [
      {
        song_ids: [SONG_ID],
        album_ids: [ALBUM_ID],
        playlist_ids: [PLAYLIST_ID],
      },
    ]);
    const repository = new PgCatalogRepository(db);

    await expect(repository.getLibraryIds(TEST_USER_ID)).resolves.toEqual({
      song_ids: [SONG_ID],
      album_ids: [ALBUM_ID],
      playlist_ids: [PLAYLIST_ID],
    });
    expect(db.calls).toHaveLength(1);
    expect([
      ...db.calls[0]!.text.matchAll(/json_agg/g),
    ]).toHaveLength(3);
  });

  it("sin DB configurada falla con un mensaje explícito", async () => {
    const repository = new PgCatalogRepository(null);

    await expect(repository.getSongById(SONG_ID)).rejects.toThrow(
      "Database is not configured",
    );
  });
});
