/**
 * Integración de `/playlists` (espejo de `apps/api/tests/test_playlists.py`).
 *
 * Cubre: alta/listado, orden de canciones, no-op al repetir, reglas de
 * visibilidad (privada solo dueño) y feed público (públicas de todos, con
 * autor, más nuevas primero).
 */

import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { playlistSongs } from "@/db/schema";
import { isUniqueViolation } from "@/lib/postgres";
import type { MyPlaylistRead, PlaylistDetail, PlaylistRead, SongRead } from "@/schemas";
import {
  createClient,
  describeDb,
  login,
  readJson,
  registerAndLogin,
  resetDb,
  testConfig,
  type TestClient,
} from "./helpers";
import { createArtist, seedCatalogBatch } from "./catalog-helpers";
import { addSongToPlaylist, createPlaylist } from "./library-helpers";

const FORBIDDEN = "No tenés acceso a esta playlist";

describeDb("playlists", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("crea una playlist y la lista", async () => {
    await registerAndLogin(client);

    const playlist = await createPlaylist(client, "Gimnasio");
    expect(playlist.name).toBe("Gimnasio");
    expect(playlist.is_public).toBe(false);
    expect(playlist.song_count).toBe(0);
    expect(playlist.songs).toEqual([]);
    expect("owner" in playlist).toBe(false); // no exponemos al owner

    const listed = await readJson<PlaylistRead[]>(
      await client.get("/playlists"),
    );
    expect(listed.some((item) => item.id === playlist.id)).toBe(true);
  });

  it("agrega y quita canciones respetando el orden", async () => {
    await registerAndLogin(client, { admin: true });
    const { artistName, songIds } = await seedCatalogBatch({
      artistName: `Cerati ${crypto.randomUUID().slice(0, 6)}`,
      albumTitle: "Bocanada",
      songs: [{ title: "Crimen" }, { title: "Adiós" }],
    });
    const s1 = { id: songIds[0]! };
    const s2 = { id: songIds[1]! };

    // Usuario normal dueño de la playlist.
    await registerAndLogin(client);
    const playlist = await createPlaylist(client, `Favoritas de ${artistName}`);

    const first = await addSongToPlaylist(client, playlist.id, s1.id);
    expect(first.song_count).toBe(1);
    expect(first.songs?.map((song) => song.title)).toEqual(["Crimen"]);

    const second = await addSongToPlaylist(client, playlist.id, s2.id);
    expect(second.song_count).toBe(2);
    expect(second.songs?.map((song) => song.title)).toEqual(["Crimen", "Adiós"]);

    // Repetir es un no-op (sin duplicar).
    const repeated = await addSongToPlaylist(client, playlist.id, s1.id);
    expect(repeated.song_count).toBe(2);

    // Detalle ordenado por posición.
    const detail = await readJson<PlaylistDetail>(
      await client.get(`/playlists/${playlist.id}`),
    );
    expect(detail.songs?.map((song) => song.title)).toEqual(["Crimen", "Adiós"]);

    // Quitar la primera: la segunda queda en posición 0.
    const removed = await readJson<PlaylistDetail>(
      await client.del(`/playlists/${playlist.id}/songs/${s1.id}`),
    );
    expect(removed.songs?.map((song) => song.title)).toEqual(["Adiós"]);
    expect(removed.song_count).toBe(1);

    // Quitar algo que no está -> 404 con el detail de Canción.
    const missing = crypto.randomUUID();
    const notThere = await client.del(`/playlists/${playlist.id}/songs/${missing}`);
    expect(notThere.status).toBe(404);
    expect(await readJson(notThere)).toEqual({
      detail: `Canción ${missing} no existe`,
    });
  });

  it("posiciones 0..n-1 y el unique (playlist_id, position) las protege", async () => {
    await registerAndLogin(client, { admin: true });
    const seeded = await seedCatalogBatch({
      songs: [{ title: "Uno" }, { title: "Dos" }, { title: "Tres" }],
    });
    const [s1, s2, s3] = seeded.songIds.map((id) => ({ id }));

    await registerAndLogin(client); // dueño de la playlist
    const playlist = await createPlaylist(client, "Orden estable");

    await addSongToPlaylist(client, playlist.id, s1!.id);
    await addSongToPlaylist(client, playlist.id, s2!.id);

    const db = createDb(testConfig());
    const rows = await db
      .select({
        songId: playlistSongs.songId,
        position: playlistSongs.position,
      })
      .from(playlistSongs)
      .where(eq(playlistSongs.playlistId, playlist.id))
      .orderBy(asc(playlistSongs.position));

    expect(rows.map((row) => row.position)).toEqual([0, 1]);
    expect(rows.map((row) => row.songId)).toEqual([s1!.id, s2!.id]);

    // Otra canción con la MISMA posición choca con el índice único.
    let duplicateError: unknown;
    try {
      await db.insert(playlistSongs).values({
        playlistId: playlist.id,
        songId: s3!.id,
        position: 0,
      });
    } catch (error) {
      duplicateError = error;
    }
    expect(isUniqueViolation(duplicateError)).toBe(true);

    // Repetir la misma canción es un no-op: sin fila nueva.
    const repeated = await addSongToPlaylist(client, playlist.id, s1!.id);
    expect(repeated.song_count).toBe(2);
    const after = await db
      .select({ position: playlistSongs.position })
      .from(playlistSongs)
      .where(eq(playlistSongs.playlistId, playlist.id));
    expect(after).toHaveLength(2);
  });

  it("agregar una canción inexistente -> 404", async () => {
    await registerAndLogin(client);
    const playlist = await createPlaylist(client);
    const missing = crypto.randomUUID();

    const response = await client.postJson(`/playlists/${playlist.id}/songs`, {
      song_id: missing,
    });

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({
      detail: `Canción ${missing} no existe`,
    });
  });

  it("reglas de acceso: privada solo el dueño, pública visible", async () => {
    await registerAndLogin(client);
    const privateOne = await createPlaylist(client, "Privada", { is_public: false });
    const publicOne = await createPlaylist(client, "Pública", { is_public: true });

    await registerAndLogin(client); // otro usuario

    const privateResponse = await client.get(`/playlists/${privateOne.id}`);
    expect(privateResponse.status).toBe(403);
    expect(await readJson(privateResponse)).toEqual({ detail: FORBIDDEN });

    expect((await client.get(`/playlists/${publicOne.id}`)).status).toBe(200);

    // Otro usuario no puede modificar ni borrar la ajena (aunque sea pública).
    const patched = await client.patchJson(`/playlists/${publicOne.id}`, {
      name: "Hackeada",
    });
    expect(patched.status).toBe(403);
    expect((await client.del(`/playlists/${publicOne.id}`)).status).toBe(403);
    expect(
      (await client.postJson(`/playlists/${publicOne.id}/songs`, {
        song_id: crypto.randomUUID(),
      })).status,
    ).toBe(403);
  });

  it("actualiza y borra una playlist propia", async () => {
    await registerAndLogin(client);
    const playlist = await createPlaylist(client, "Viejo nombre");

    const coverKey = "covers/55555555-5555-4555-8555-555555555555.webp";
    const patched = await client.patchJson(`/playlists/${playlist.id}`, {
      name: "Nuevo nombre",
      is_public: true,
      cover_key: coverKey,
    });
    expect(patched.status).toBe(200);
    const body = await readJson<PlaylistDetail>(patched);
    expect(body.name).toBe("Nuevo nombre");
    expect(body.is_public).toBe(true);
    expect(body.cover_key).toBe(coverKey);
    expect((body.cover_url ?? null) === null || (body.cover_url ?? "").endsWith(`/${coverKey}`)).toBe(
      true,
    );

    expect((await client.del(`/playlists/${playlist.id}`)).status).toBe(204);
    expect((await client.get(`/playlists/${playlist.id}`)).status).toBe(404);
  });

  it("PATCH con cover_key fuera del patrón -> 422", async () => {
    await registerAndLogin(client);
    const playlist = await createPlaylist(client);

    const response = await client.patchJson(`/playlists/${playlist.id}`, {
      cover_key: "covers/playlist.jpg",
    });
    expect(response.status).toBe(422);
  });

  it("creates a playlist with optional WebP cover_key and validates invalid pattern", async () => {
    await registerAndLogin(client);

    const invalid = await client.postJson("/playlists", {
      name: "Invalid cover",
      cover_key: "covers/not-webp.png",
    });
    expect(invalid.status).toBe(422);

    const coverKey = "covers/77777777-7777-4777-8777-777777777777.webp";
    const created = await client.postJson("/playlists", {
      name: "With cover",
      cover_key: coverKey,
    });
    expect(created.status).toBe(201);
    const body = await readJson<PlaylistDetail>(created);
    expect(body.cover_key).toBe(coverKey);
    expect(body.collage_cover_urls).toEqual([]);
  });

  it("requiere sesión", async () => {
    expect((await client.get("/playlists")).status).toBe(401);
    expect((await client.postJson("/playlists", { name: "X" })).status).toBe(401);
    expect((await client.get("/me/playlists")).status).toBe(401);
  });

  it("feed público: públicas de todos, sin privadas y con autor", async () => {
    const userA = await registerAndLogin(client);
    await createPlaylist(client, "Pública de A", { is_public: true });
    await createPlaylist(client, "Privada de A", { is_public: false });

    const userB = await registerAndLogin(client);
    await createPlaylist(client, "Pública de B", { is_public: true });

    const response = await client.get("/playlists/public");
    expect(response.status).toBe(200);
    const body = await readJson<{ items: PlaylistRead[]; total: number }>(response);
    const names = body.items.map((playlist) => playlist.name);

    expect(names).toContain("Pública de A");
    expect(names).toContain("Pública de B");
    expect(names).not.toContain("Privada de A");

    // Las más nuevas primero (B creó la última) y con el autor en cada item.
    expect(names.indexOf("Pública de B")).toBeLessThan(
      names.indexOf("Pública de A"),
    );
    const byName = new Map(body.items.map((playlist) => [playlist.name, playlist]));
    expect(byName.get("Pública de A")?.owner_email).toBe(userA.email);
    expect(byName.get("Pública de B")?.owner_email).toBe(userB.email);
    expect(body.total).toBe(2);
  });

  it("el feed público no requiere sesión", async () => {
    const anonymous = createClient();
    const response = await anonymous.get("/playlists/public");

    expect(response.status).toBe(200);
    const body = await readJson<Record<string, unknown>>(response);
    expect(Object.keys(body).sort()).toEqual(["items", "limit", "offset", "total"]);
  });

  it("mine=false devuelve solo las públicas del propio usuario", async () => {
    const userA = await registerAndLogin(client);
    await createPlaylist(client, "Mía pública", { is_public: true });
    await createPlaylist(client, "Mía privada", { is_public: false });

    await registerAndLogin(client);
    await createPlaylist(client, "De otro", { is_public: true });

    // Vuelvo a A: `mine=false` filtra sus públicas, no las de B.
    expect((await login(client, userA.email)).status).toBe(204);

    const mine = await readJson<PlaylistRead[]>(await client.get("/playlists"));
    const publicOnly = await readJson<PlaylistRead[]>(
      await client.get("/playlists?mine=false"),
    );

    expect(mine.map((playlist) => playlist.name).sort()).toEqual([
      "Mía privada",
      "Mía pública",
    ]);
    expect(publicOnly.map((playlist) => playlist.name)).toEqual(["Mía pública"]);
  });

  it("quitar canciones renumera las posiciones (detalle y song_ids)", async () => {
    await registerAndLogin(client, { admin: true });
    const seeded = await seedCatalogBatch({
      albumTitle: "Cuatro",
      songs: [
        { title: "Uno" },
        { title: "Dos" },
        { title: "Tres" },
        { title: "Cuatro" },
      ],
    });
    const created = seeded.songIds.map((id) => ({ id }));

    await registerAndLogin(client);
    const playlist = await createPlaylist(client, "Renumerada");
    for (const song of created) {
      await addSongToPlaylist(client, playlist.id, song.id);
    }

    // Quitar la 2ª y la 3ª: quedan la 1ª y la 4ª, renumeradas 0..n-1.
    expect(
      (await client.del(`/playlists/${playlist.id}/songs/${created[1]!.id}`))
        .status,
    ).toBe(200);
    expect(
      (await client.del(`/playlists/${playlist.id}/songs/${created[2]!.id}`))
        .status,
    ).toBe(200);

    const detail = await readJson<PlaylistDetail>(
      await client.get(`/playlists/${playlist.id}`),
    );
    expect(detail.songs?.map((song) => song.title)).toEqual(["Uno", "Cuatro"]);
    expect(detail.song_count).toBe(2);

    // `song_ids` sale del orden de posición (no del orden de alta original).
    const mine = await readJson<MyPlaylistRead[]>(
      await client.get("/me/playlists"),
    );
    const stored = mine.find((item) => item.id === playlist.id);
    expect(stored?.song_ids).toEqual([created[0]!.id, created[3]!.id]);

    // Y el detalle sigue siendo consistente después de reordenar de nuevo.
    await addSongToPlaylist(client, playlist.id, created[1]!.id);
    const afterReAdd = await readJson<PlaylistDetail>(
      await client.get(`/playlists/${playlist.id}`),
    );
    expect(afterReAdd.songs?.map((song) => song.title)).toEqual([
      "Uno",
      "Cuatro",
      "Dos",
    ]);
    // Timeout ampliado: este test encadena ~15 requests contra Neon remoto y
    // con latencia alta puede superar el default de 20s (verificado: el
    // DELETE del remove responde en ~1.3s, no es un hang).
  }, 40_000);

  it("quitar la primera canción renumera sin chocar el unique de posición", async () => {
    // Caso de colisión transitoria que justifica el offset del remove:
    // supervivientes en 1,2 → destinos 0,1 — sin offset, un renumerado en
    // un solo UPDATE puede pisar `ux_playlist_songs_position` (la fila en 1
    // todavía ocupa el destino 1 de la fila en 2).
    await registerAndLogin(client, { admin: true });
    const seeded = await seedCatalogBatch({
      albumTitle: "Tres",
      songs: [{ title: "Uno" }, { title: "Dos" }, { title: "Tres" }],
    });
    const created = seeded.songIds.map((id) => ({ id }));

    await registerAndLogin(client);
    const playlist = await createPlaylist(client, "Offset renumber");
    for (const song of created) {
      await addSongToPlaylist(client, playlist.id, song.id);
    }

    const removed = await client.del(
      `/playlists/${playlist.id}/songs/${created[0]!.id}`,
    );
    expect(removed.status).toBe(200);

    const detail = await readJson<PlaylistDetail>(
      await client.get(`/playlists/${playlist.id}`),
    );
    expect(detail.songs?.map((song) => song.title)).toEqual(["Dos", "Tres"]);
    expect(detail.song_count).toBe(2);
  }, 40_000);

  it("el detalle expone SongRead completo (álbum y colaboradores)", async () => {
    await registerAndLogin(client, { admin: true });
    const guest = await createArtist(client, `Feat ${crypto.randomUUID().slice(0, 6)}`);
    const seeded = await seedCatalogBatch({
      albumTitle: "Disco",
      songs: [{ title: "Con Feat", collaboratorIds: [guest.id] }],
    });
    const songId = seeded.songIds[0]!;
    const albumId = seeded.albumId;

    await registerAndLogin(client);
    const playlist = await createPlaylist(client);
    const detail = await addSongToPlaylist(client, playlist.id, songId);

    const item = detail.songs?.[0] as SongRead | undefined;
    expect(item?.album?.id).toBe(albumId);
    expect(item?.collaborators?.map((artistRow) => artistRow.id)).toEqual([
      guest.id,
    ]);
  });
});
