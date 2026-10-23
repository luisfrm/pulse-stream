/**
 * Integración de `/albums` (espejo de `apps/api/tests/test_albums.py`).
 *
 * Listado público con `song_count` (LEFT JOIN agrupado), detalle con canciones
 * en orden de creación, borrado bloqueado si tiene canciones (400) y filtro de
 * colaboradores (el invitado aparece, el principal NO, un tercero tampoco).
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  createClient,
  describeDb,
  readJson,
  registerAndLogin,
  resetDb,
  type TestClient,
} from "./helpers";
import { createAlbum, createArtist, createSong } from "./catalog-helpers";
import type { AlbumDetail, AlbumRead, SongRead } from "@/schemas";

const ADMIN_REQUIRED = "Requiere permisos de administrador";

function uniqueKey(prefix: string): string {
  return `songs/${prefix}-${crypto.randomUUID().slice(0, 8)}.mp3`;
}

describeDb("albums", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("crear requiere admin; el listado es público", async () => {
    // sin sesión -> 401
    const anonymous = await client.postJson("/albums", {
      title: "X",
      artist_id: crypto.randomUUID(),
    });
    expect(anonymous.status).toBe(401);

    // usuario normal -> 403
    await registerAndLogin(client);
    const forbidden = await client.postJson("/albums", {
      title: "X",
      artist_id: crypto.randomUUID(),
    });
    expect(forbidden.status).toBe(403);
    expect(await readJson(forbidden)).toEqual({ detail: ADMIN_REQUIRED });

    // el listado es público (catálogo)
    expect((await client.get("/albums")).status).toBe(200);
  });

  it("álbum con canciones y detalle completo", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id, "Disco Uno");

    expect(album.title).toBe("Disco Uno");
    expect(album.song_count).toBe(0);
    expect(album.artist.id).toBe(artist.id);
    expect(album.songs).toEqual([]);

    const s1 = await createSong(client, {
      title: "Tema 1",
      artistId: artist.id,
      albumId: album.id,
      objectKey: uniqueKey("a1"),
    });
    const s2 = await createSong(client, {
      title: "Tema 2",
      artistId: artist.id,
      albumId: album.id,
      objectKey: uniqueKey("a2"),
    });

    const detail = await readJson<AlbumDetail>(
      await client.get(`/albums/${album.id}`),
    );
    expect(detail.song_count).toBe(2);
    // Orden de creación (el relationship de Python no tenía order_by).
    expect(detail.songs?.map((song) => song.id)).toEqual([s1.id, s2.id]);

    // Cada canción del detalle es un SongRead completo: su álbum (back-populado
    // al propio padre, con artista) y sus colaboradores.
    const first = detail.songs?.[0];
    expect(first?.album?.id).toBe(album.id);
    expect(first?.album?.artist.id).toBe(artist.id);
    expect(first?.collaborators).toEqual([]);
    expect(first?.artist.id).toBe(artist.id);

    // La canción también conoce su álbum (con su artista)
    const song = await readJson<SongRead>(await client.get(`/songs/${s1.id}`));
    expect(song.album?.id).toBe(album.id);
    expect(song.album?.artist.id).toBe(artist.id);
  });

  it("detalle de un álbum inexistente -> 404 con el detail de Python", async () => {
    const missing = crypto.randomUUID();

    const response = await client.get(`/albums/${missing}`);
    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({
      detail: `Álbum ${missing} no existe`,
    });
  });

  it("listado con song_count, orden created_at desc y filtro por artista", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const other = await createArtist(client, `Otro ${crypto.randomUUID().slice(0, 6)}`);

    const mine = await createAlbum(client, artist.id, "Mío");
    await createAlbum(client, other.id, "De otro");
    await createSong(client, {
      title: "Único",
      artistId: artist.id,
      albumId: mine.id,
      objectKey: uniqueKey("count"),
    });

    const filtered = await readJson<{ items: AlbumRead[]; total: number }>(
      await client.get(`/albums?artist_id=${artist.id}`),
    );
    expect(filtered.total).toBe(1);
    const titles = filtered.items.map((album) => album.title);
    expect(titles).toContain("Mío");
    expect(titles).not.toContain("De otro");
    expect(filtered.items[0]?.song_count).toBe(1);

    // Sin filtro: los más nuevos primero (el último creado es «De otro»).
    const all = await readJson<{ items: AlbumRead[]; total: number }>(
      await client.get("/albums"),
    );
    expect(all.total).toBe(2);
    expect(all.items.map((album) => album.title)).toEqual(["De otro", "Mío"]);

    // `song_count` sale del LEFT JOIN + count(songs.id): el álbum SIN canciones
    // tiene que dar 0 (no 1 por la fila del LEFT JOIN).
    const empty = all.items.find((album) => album.id !== mine.id);
    expect(empty?.song_count).toBe(0);
    expect(all.items.find((album) => album.id === mine.id)?.song_count).toBe(1);

    // `q` filtra por título (case-insensitive)
    const searched = await readJson<{ items: AlbumRead[]; total: number }>(
      await client.get(`/albums?q=${encodeURIComponent("de otro")}`),
    );
    expect(searched.total).toBe(1);
    expect(searched.items[0]?.title).toBe("De otro");
  });

  it("crear un álbum con un artista inexistente -> 404", async () => {
    await registerAndLogin(client, { admin: true });
    const missing = crypto.randomUUID();

    const response = await client.postJson("/albums", {
      title: "Fantasma",
      artist_id: missing,
    });
    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({
      detail: `Artista ${missing} no existe`,
    });
  });

  it("PATCH aplica solo los campos provistos e ignora cover_key null", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Con Cover ${crypto.randomUUID().slice(0, 6)}`);
    const other = await createArtist(client, `Reasignado ${crypto.randomUUID().slice(0, 6)}`);
    const coverKey = `covers/${crypto.randomUUID()}.webp`;

    const created = await client.postJson("/albums", {
      title: "Original",
      artist_id: artist.id,
      cover_key: coverKey,
    });
    expect(created.status).toBe(201);
    const album = await readJson<AlbumDetail>(created);
    expect(album.cover_key).toBe(coverKey);

    // `cover_key: null` NO borra el cover (semántica `if ... is not None`).
    const patched = await client.patchJson(`/albums/${album.id}`, {
      title: "Renombrado",
      cover_key: null,
    });
    expect(patched.status).toBe(200);
    const body = await readJson<AlbumDetail>(patched);
    expect(body.title).toBe("Renombrado");
    expect(body.cover_key).toBe(coverKey);
    expect(body.artist.id).toBe(artist.id);

    // Reasignar el artista
    const reassigned = await readJson<AlbumDetail>(
      await client.patchJson(`/albums/${album.id}`, { artist_id: other.id }),
    );
    expect(reassigned.artist.id).toBe(other.id);
    expect(reassigned.title).toBe("Renombrado");
  });

  it("borrar un álbum con canciones -> 400 (singular y plural)", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);
    await createSong(client, {
      title: "Tema",
      artistId: artist.id,
      albumId: album.id,
      objectKey: uniqueKey("del"),
    });

    const single = await client.del(`/albums/${album.id}`);
    expect(single.status).toBe(400);
    expect(await readJson(single)).toEqual({
      detail: `El álbum ${album.id} tiene 1 canción: reasignalas a otro álbum antes de borrarlo`,
    });

    // el álbum y la canción siguen intactos
    expect((await client.get(`/albums/${album.id}`)).status).toBe(200);

    await createSong(client, {
      title: "Otro tema",
      artistId: artist.id,
      albumId: album.id,
      objectKey: uniqueKey("del2"),
    });
    const plural = await client.del(`/albums/${album.id}`);
    expect(plural.status).toBe(400);
    expect(await readJson(plural)).toEqual({
      detail: `El álbum ${album.id} tiene 2 canciones: reasignalas a otro álbum antes de borrarlo`,
    });
  });

  it("borrar un álbum sin canciones -> 204", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);

    const response = await client.del(`/albums/${album.id}`);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");

    expect((await client.get(`/albums/${album.id}`)).status).toBe(404);
  });

  it("colaboradores: el invitado aparece, el principal NO, un tercero tampoco", async () => {
    await registerAndLogin(client, { admin: true });
    const main = await createArtist(client, `Principal ${crypto.randomUUID().slice(0, 6)}`);
    const guest = await createArtist(client, `Invitado ${crypto.randomUUID().slice(0, 6)}`);
    const other = await createArtist(client, `Otro ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, main.id, "Feat Album");

    const song = await createSong(client, {
      title: "Feat.",
      artistId: main.id,
      albumId: album.id,
      objectKey: uniqueKey("feat"),
      collaboratorIds: [guest.id],
    });

    // la canción expone sus colaboradores
    const detail = await readJson<SongRead>(await client.get(`/songs/${song.id}`));
    expect(detail.collaborators?.map((artist) => artist.name)).toEqual([
      guest.name,
    ]);

    // filtro de colaboraciones
    const asGuest = await readJson<{ items: SongRead[] }>(
      await client.get(`/songs?collaborator_id=${guest.id}`),
    );
    expect(asGuest.items.map((item) => item.id)).toEqual([song.id]);

    const asMain = await readJson<{ items: SongRead[] }>(
      await client.get(`/songs?collaborator_id=${main.id}`),
    );
    expect(asMain.items).toEqual([]);

    const asOther = await readJson<{ items: SongRead[] }>(
      await client.get(`/songs?collaborator_id=${other.id}`),
    );
    expect(asOther.items).toEqual([]);

    // el artista principal sí la tiene en sus canciones
    const asArtist = await readJson<{ items: SongRead[] }>(
      await client.get(`/songs?artist_id=${main.id}`),
    );
    expect(asArtist.items.map((item) => item.id)).toEqual([song.id]);
  });

  it("mutaciones sin sesión -> 401; usuario normal -> 403", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Protegido ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);

    const anonymous = createClient();
    expect((await anonymous.del(`/albums/${album.id}`)).status).toBe(401);
    expect(
      (await anonymous.patchJson(`/albums/${album.id}`, { title: "X" })).status,
    ).toBe(401);

    const normal = createClient();
    await registerAndLogin(normal);
    expect((await normal.del(`/albums/${album.id}`)).status).toBe(403);
    expect(
      (await normal.patchJson(`/albums/${album.id}`, { title: "Y" })).status,
    ).toBe(403);
  });

  it("PATCH/DELETE de un álbum inexistente -> 404", async () => {
    await registerAndLogin(client, { admin: true });
    const missing = crypto.randomUUID();

    expect(
      (await client.patchJson(`/albums/${missing}`, { title: "Nadie" })).status,
    ).toBe(404);
    expect((await client.del(`/albums/${missing}`)).status).toBe(404);
  });

  it("album_id que no es uuid -> 422 (no 404)", async () => {
    expect((await client.get("/albums/no-es-uuid")).status).toBe(422);

    await registerAndLogin(client, { admin: true });
    expect(
      (await client.patchJson("/albums/no-es-uuid", { title: "X" })).status,
    ).toBe(422);
  });
});
