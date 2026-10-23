/**
 * Integración de `/songs` (espejo de `apps/api/tests/test_songs.py` + los
 * asserts de `/songs/popular` de `test_listens.py`/`test_plays.py`).
 *
 * Reglas: álbum obligatorio (422 en el alta, 400 al intentar quitarlo), artista
 * inline con lookup case-insensitive, géneros validados por zod, colaboradores
 * reemplazables y ranking de populares por reproducciones de la VENTANA.
 *
 * OJO: estas pruebas siembran `listens` directo en la DB a propósito, porque
 * necesitan (a) plays con timestamps viejos (ventanas de `days`) y (b) el
 * contador persistente `songs.play_count` en 0 para demostrar que el
 * `play_count` del ranking es el de la VENTANA. El camino HTTP de
 * `/me/listens` (contadores reales) está cubierto en `tests/plays.test.ts`.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { listens, playlistSongs, playlists, songs } from "@/db/schema";
import type { SongRead } from "@/schemas";
import {
  createClient,
  describeDb,
  readJson,
  registerAndLogin,
  resetDb,
  testBindings,
  testConfig,
  type TestClient,
} from "./helpers";
import { createAlbum, createArtist, createSong } from "./catalog-helpers";

const ADMIN_REQUIRED = "Requiere permisos de administrador";
const ALBUM_REQUIRED = "La canción requiere un álbum";
const R2_BASE = "https://cdn.pulse.test";

/** Fila de `listens` directa: el endpoint `POST /me/listens` es de F5. */
async function insertListen(
  userId: string,
  songId: string,
  playedAt?: Date,
): Promise<void> {
  await createDb(testConfig())
    .insert(listens)
    .values({
      id: crypto.randomUUID(),
      userId,
      songId,
      ...(playedAt ? { playedAt } : {}),
    });
}

describeDb("songs", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("crea una canción con un artista existente", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Gustavo Cerati");
    const album = await createAlbum(client, artist.id, "Bocanada");

    const response = await client.postJson("/songs", {
      title: "Crimen",
      artist_id: artist.id,
      album_id: album.id,
      genres: ["rock", "pop"],
      object_key: "songs/abc.mp3",
      lyrics: "Un crimen...",
      duration_seconds: 250,
    });

    expect(response.status).toBe(201);
    const song = await readJson<SongRead>(response);
    expect(song.title).toBe("Crimen");
    expect(song.artist.name).toBe("Gustavo Cerati");
    expect(song.genres).toEqual(["rock", "pop"]);
    expect(song.lyrics).toBe("Un crimen...");
    expect(song.duration_seconds).toBe(250);
    expect(song.play_count).toBe(0);
    expect(song.collaborators).toEqual([]);
    expect(song.album?.id).toBe(album.id);
    // stream_url: None (sin R2_PUBLIC_BASE_URL) o URL pública del objeto
    const streamUrl = song.stream_url ?? null;
    expect(
      streamUrl === null || streamUrl.endsWith(`/${song.object_key}`),
    ).toBe(true);
  });

  it("toda canción requiere álbum -> 422", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Sin Álbum");

    const response = await client.postJson("/songs", {
      title: "Huérfana",
      artist_id: artist.id,
      object_key: "songs/x.mp3",
    });

    expect(response.status).toBe(422);
  });

  it("crea el artista inline con `artist_name`", async () => {
    await registerAndLogin(client, { admin: true });
    // El álbum debe existir (la validación solo exige existencia, no dueño).
    const other = await createArtist(client, "Dueño Del Álbum");
    const album = await createAlbum(client, other.id, "Álbum Prestado");

    const response = await client.postJson("/songs", {
      title: "De Música Ligera",
      artist_name: "Soda Stereo Nuevo",
      album_id: album.id,
      genres: ["rock"],
      object_key: "songs/def.mp3",
    });

    expect(response.status).toBe(201);
    expect((await readJson<SongRead>(response)).artist.name).toBe(
      "Soda Stereo Nuevo",
    );

    // El artista quedó creado en la misma operación
    const artists = await readJson<{ total: number }>(
      await client.get("/artists?q=soda stereo nuevo"),
    );
    expect(artists.total).toBe(1);
  });

  it("reusa el artista inline existente (case-insensitive)", async () => {
    // Nombre único por corrida: la base de test se comparte entre archivos.
    const name = `Soda Stereo ${crypto.randomUUID().slice(0, 6)}`;
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, name);
    const album = await createAlbum(client, artist.id);

    const response = await client.postJson("/songs", {
      title: "Nada Personal",
      artist_name: name.toLowerCase(),
      album_id: album.id,
      object_key: "songs/ghi.mp3",
    });

    expect(response.status).toBe(201);
    expect((await readJson<SongRead>(response)).artist.name).toBe(name);

    const artists = await readJson<{ total: number }>(
      await client.get(`/artists?q=${encodeURIComponent(name)}`),
    );
    expect(artists.total).toBe(1); // no duplicó el artista
  });

  it("sin artista ni artista inline -> 422", async () => {
    await registerAndLogin(client, { admin: true });
    const owner = await createArtist(client, "Sin Artista Dueño");
    const album = await createAlbum(client, owner.id);

    const response = await client.postJson("/songs", {
      title: "X",
      album_id: album.id,
      object_key: "songs/x.mp3",
    });

    expect(response.status).toBe(422);
  });

  it("género inválido -> 422", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Algo");
    const album = await createAlbum(client, artist.id);

    const response = await client.postJson("/songs", {
      title: "X",
      artist_id: artist.id,
      album_id: album.id,
      genres: ["reggae-no-existe"],
      object_key: "songs/x.mp3",
    });

    expect(response.status).toBe(422);
  });

  it("artista o álbum inexistente -> 404 con el detail de Python", async () => {
    await registerAndLogin(client, { admin: true });
    const owner = await createArtist(client, "Dueño Álbum Inválido");
    const album = await createAlbum(client, owner.id);

    const missingArtist = crypto.randomUUID();
    const badArtist = await client.postJson("/songs", {
      title: "X",
      artist_id: missingArtist,
      album_id: album.id,
      object_key: "songs/x.mp3",
    });
    expect(badArtist.status).toBe(404);
    expect(await readJson(badArtist)).toEqual({
      detail: `Artista ${missingArtist} no existe`,
    });

    const missingAlbum = crypto.randomUUID();
    const badAlbum = await client.postJson("/songs", {
      title: "X",
      artist_id: owner.id,
      album_id: missingAlbum,
      object_key: "songs/y.mp3",
    });
    expect(badAlbum.status).toBe(404);
    expect(await readJson(badAlbum)).toEqual({
      detail: `Álbum ${missingAlbum} no existe`,
    });
  });

  it("colaborador inexistente -> 404", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Con Colaborador");
    const album = await createAlbum(client, artist.id);
    const missing = crypto.randomUUID();

    const response = await client.postJson("/songs", {
      title: "X",
      artist_id: artist.id,
      album_id: album.id,
      object_key: "songs/collab.mp3",
      collaborator_ids: [missing],
    });

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({
      detail: `Artista ${missing} no existe`,
    });
  });

  it("valida álbum y colaboradores ANTES de crear el artista inline (sin huérfanos)", async () => {
    await registerAndLogin(client, { admin: true });
    const owner = await createArtist(client, "Dueño Validaciones");
    const album = await createAlbum(client, owner.id);
    const name = `Inline Fantasma ${crypto.randomUUID().slice(0, 6)}`;

    // Álbum inexistente: 404 y el artista inline NO debe quedar creado.
    const badAlbum = await client.postJson("/songs", {
      title: "X",
      artist_name: name,
      album_id: crypto.randomUUID(),
      object_key: "songs/huerfano-album.mp3",
    });
    expect(badAlbum.status).toBe(404);

    // Colaborador inexistente: mismo criterio.
    const badCollaborator = await client.postJson("/songs", {
      title: "X",
      artist_name: name,
      album_id: album.id,
      object_key: "songs/huerfano-colab.mp3",
      collaborator_ids: [crypto.randomUUID()],
    });
    expect(badCollaborator.status).toBe(404);

    const found = await readJson<{ total: number }>(
      await client.get(`/artists?q=${encodeURIComponent(name)}`),
    );
    expect(found.total).toBe(0);
  });

  it("colaboradores duplicados no rompen la PK compuesta", async () => {
    await registerAndLogin(client, { admin: true });
    const main = await createArtist(client, "Principal Duplicado");
    const guest = await createArtist(client, "Invitado Duplicado");
    const album = await createAlbum(client, main.id);

    const created = await createSong(client, {
      title: "Feat Repetido",
      artistId: main.id,
      albumId: album.id,
      objectKey: "songs/feat-repetido.mp3",
      collaboratorIds: [guest.id, guest.id],
    });

    // Se guarda una sola vez (dedupe del service), no un 500 por PK.
    expect(created.collaborators?.map((artist) => artist.id)).toEqual([
      guest.id,
    ]);
  });

  it("PATCH no puede quitar el álbum (null) -> 400", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "No Quitar Álbum");
    const album = await createAlbum(client, artist.id);
    const song = await createSong(client, {
      title: "Con Álbum",
      artistId: artist.id,
      albumId: album.id,
      objectKey: "songs/na.mp3",
    });

    const response = await client.patchJson(`/songs/${song.id}`, {
      album_id: null,
    });

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({ detail: ALBUM_REQUIRED });
  });

  it("la canción hereda el cover del álbum", async () => {
    // Base pública de R2 explícita: sin eso `cover_url` sería null (en Python
    // el .env de la API sí trae R2_PUBLIC_BASE_URL).
    const covered = createClient(
      testBindings({ R2_PUBLIC_BASE_URL: R2_BASE }),
    );
    await registerAndLogin(covered, { admin: true });
    const artist = await createArtist(covered, "Hereda Cover");
    // Key con formato del presign (`covers/{uuid}.webp`): el schema exige el
    // patrón estricto en escritura.
    const albumKey = `covers/${crypto.randomUUID()}.webp`;

    const albumResponse = await covered.postJson("/albums", {
      title: "Con Cover",
      artist_id: artist.id,
      cover_key: albumKey,
    });
    expect(albumResponse.status).toBe(201);
    const album = await readJson<{ id: string }>(albumResponse);

    const song = await createSong(covered, {
      title: "Heredada",
      artistId: artist.id,
      albumId: album.id,
      objectKey: "songs/h.mp3",
    });

    expect("cover_key" in song).toBe(false);
    expect(song.cover_url).toBe(`${R2_BASE}/${albumKey}`);
  });

  it("un usuario normal no puede crear canciones -> 403", async () => {
    await registerAndLogin(client);

    const response = await client.postJson("/songs", {
      title: "X",
      artist_name: "A",
      object_key: "songs/x.mp3",
    });

    expect(response.status).toBe(403);
    expect(await readJson(response)).toEqual({ detail: ADMIN_REQUIRED });
  });

  it("listar, buscar, obtener, actualizar y borrar", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Queen");
    const album = await createAlbum(client, artist.id, "A Night at the Opera");
    const song = await createSong(client, {
      title: "Bohemian Rhapsody",
      artistId: artist.id,
      albumId: album.id,
      objectKey: "songs/queen1.mp3",
    });

    // Listado + búsqueda por título
    const search = await client.get("/songs?q=bohemian");
    expect(search.status).toBe(200);
    const page = await readJson<{ items: SongRead[]; total: number }>(search);
    expect(page.total).toBe(1);
    expect(page.items[0]?.artist.name).toBe("Queen");

    // Get por id
    const byId = await client.get(`/songs/${song.id}`);
    expect(byId.status).toBe(200);
    expect((await readJson<SongRead>(byId)).title).toBe("Bohemian Rhapsody");

    // Update
    const patched = await client.patchJson(`/songs/${song.id}`, {
      title: "Bohemian Rhapsody (Live)",
    });
    expect(patched.status).toBe(200);
    expect((await readJson<SongRead>(patched)).title).toBe(
      "Bohemian Rhapsody (Live)",
    );

    // Delete -> 404 después
    expect((await client.del(`/songs/${song.id}`)).status).toBe(204);

    const missing = await client.get(`/songs/${song.id}`);
    expect(missing.status).toBe(404);
    expect(await readJson(missing)).toEqual({
      detail: `Canción ${song.id} no existe`,
    });
  });

  it("PATCH reemplaza colaboradores (incluso con array vacío)", async () => {
    await registerAndLogin(client, { admin: true });
    const main = await createArtist(client, "Principal PATCH");
    const guest = await createArtist(client, "Invitado PATCH");
    const album = await createAlbum(client, main.id);
    const song = await createSong(client, {
      title: "Feat",
      artistId: main.id,
      albumId: album.id,
      objectKey: "songs/patch-feat.mp3",
      collaboratorIds: [guest.id],
    });
    expect(song.collaborators?.map((artist) => artist.id)).toEqual([guest.id]);

    const cleared = await client.patchJson(`/songs/${song.id}`, {
      collaborator_ids: [],
    });
    expect(cleared.status).toBe(200);
    expect((await readJson<SongRead>(cleared)).collaborators).toEqual([]);

    const restored = await client.patchJson(`/songs/${song.id}`, {
      collaborator_ids: [guest.id],
    });
    expect(
      (await readJson<SongRead>(restored)).collaborators?.map(
        (artist) => artist.id,
      ),
    ).toEqual([guest.id]);
  });

  it("PATCH con collaborator_ids: null limpia el set (como un array vacío)", async () => {
    await registerAndLogin(client, { admin: true });
    const main = await createArtist(client, "Principal Null");
    const guest = await createArtist(client, "Invitado Null");
    const album = await createAlbum(client, main.id);
    const song = await createSong(client, {
      title: "Feat Null",
      artistId: main.id,
      albumId: album.id,
      objectKey: "songs/feat-null.mp3",
      collaboratorIds: [guest.id],
    });

    const cleared = await client.patchJson(`/songs/${song.id}`, {
      collaborator_ids: null,
    });
    expect(cleared.status).toBe(200);
    expect((await readJson<SongRead>(cleared)).collaborators).toEqual([]);
    // El resto de la canción no cambió.
    const stored = await readJson<SongRead>(await client.get(`/songs/${song.id}`));
    expect(stored.title).toBe("Feat Null");
    expect(stored.collaborators).toEqual([]);
  });

  it("más de 50 colaboradores -> 422", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Tope Colaboradores");
    const album = await createAlbum(client, artist.id);

    const response = await client.postJson("/songs", {
      title: "Muchos Feats",
      artist_id: artist.id,
      album_id: album.id,
      object_key: "songs/muchos-feats.mp3",
      collaborator_ids: Array.from({ length: 51 }, () => crypto.randomUUID()),
    });

    expect(response.status).toBe(422);
  });

  it("path params uuid: acepta las formas de Python y 422 para lo inválido", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "UUID Path");
    const album = await createAlbum(client, artist.id);
    const song = await createSong(client, {
      title: "UUID",
      artistId: artist.id,
      albumId: album.id,
      objectKey: "songs/uuid-path.mp3",
    });

    // `uuid.UUID()` acepta 32 hex sin guiones, mayúsculas, llaves y urn:uuid:.
    const forms = [
      song.id.replace(/-/g, ""),
      song.id.toUpperCase(),
      `{${song.id}}`,
      `urn:uuid:${song.id}`,
    ];
    for (const form of forms) {
      expect((await client.get(`/songs/${form}`)).status).toBe(200);
    }

    // Lo que Python rechaza sigue siendo 422 (no 404).
    for (const invalid of ["no-es-uuid", "123", `${song.id}x`]) {
      const response = await client.get(`/songs/${invalid}`);
      expect(response.status).toBe(422);
      expect((await readJson<{ detail: { type: string }[] }>(response)).detail[0]?.type)
        .toBe("uuid_parsing");
    }
  });

  it("PATCH aplica solo los campos provistos", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Patch Parcial");
    const album = await createAlbum(client, artist.id);
    const song = await createSong(client, {
      title: "Original",
      artistId: artist.id,
      albumId: album.id,
      objectKey: "songs/patch-parcial.mp3",
      genres: ["rock"],
      lyrics: "letra original",
      durationSeconds: 100,
    });

    const patched = await readJson<SongRead>(
      await client.patchJson(`/songs/${song.id}`, { lyrics: "letra nueva" }),
    );
    expect(patched.lyrics).toBe("letra nueva");
    expect(patched.title).toBe("Original");
    expect(patched.genres).toEqual(["rock"]);
    expect(patched.duration_seconds).toBe(100);
    expect(patched.album?.id).toBe(album.id);
  });

  it("filtra por album_id", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Filter Album Artist");
    const albumA = await createAlbum(client, artist.id, "Album A");
    const albumB = await createAlbum(client, artist.id, "Album B");

    await createSong(client, {
      title: "A1",
      artistId: artist.id,
      albumId: albumA.id,
      objectKey: "songs/a1.mp3",
    });
    await createSong(client, {
      title: "A2",
      artistId: artist.id,
      albumId: albumA.id,
      objectKey: "songs/a2.mp3",
    });
    await createSong(client, {
      title: "B1",
      artistId: artist.id,
      albumId: albumB.id,
      objectKey: "songs/b1.mp3",
    });

    const response = await client.get(`/songs?album_id=${albumA.id}`);
    expect(response.status).toBe(200);
    const data = await readJson<{ items: SongRead[]; total: number }>(response);
    expect(data.total).toBe(2);
    expect(new Set(data.items.map((song) => song.title))).toEqual(
      new Set(["A1", "A2"]),
    );
    expect(data.items.every((song) => song.album?.id === albumA.id)).toBe(true);
    // Orden por defecto sin playlist: created_at desc (A2 es más nueva).
    expect(data.items.map((song) => song.title)).toEqual(["A2", "A1"]);
  });

  it("filtra por playlist_id en orden de posición", async () => {
    const user = await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Filter Playlist Artist");
    const album = await createAlbum(client, artist.id, "Filter Album");

    // `POST /playlists` + `POST /playlists/{id}/songs` son de F5: se insertan
    // las filas directo (mismas tablas que usa el endpoint cuando exista).
    const playlistId = crypto.randomUUID();
    await createDb(testConfig()).insert(playlists).values({
      id: playlistId,
      name: "Mi playlist",
      isPublic: false,
      ownerId: user.id,
    });

    const songs: SongRead[] = [];
    for (const [index, title] of ["Primera", "Segunda", "Tercera"].entries()) {
      songs.push(
        await createSong(client, {
          title,
          artistId: artist.id,
          albumId: album.id,
          objectKey: `songs/p${index + 1}.mp3`,
        }),
      );
    }
    // Canción sin agregar a la playlist — no debe aparecer
    await createSong(client, {
      title: "Fuera",
      artistId: artist.id,
      albumId: album.id,
      objectKey: "songs/p4.mp3",
    });

    // Posiciones invertidas a propósito: el endpoint ordena por `position`,
    // no por el orden de creación ni por el orden del array de entrada.
    await createDb(testConfig())
      .insert(playlistSongs)
      .values([
        { playlistId, songId: songs[0]!.id, position: 2 },
        { playlistId, songId: songs[1]!.id, position: 0 },
        { playlistId, songId: songs[2]!.id, position: 1 },
      ]);

    const response = await client.get(`/songs?playlist_id=${playlistId}`);
    expect(response.status).toBe(200);
    const data = await readJson<{ items: SongRead[]; total: number }>(response);
    expect(data.total).toBe(3);
    expect(data.items.map((song) => song.title)).toEqual([
      "Segunda",
      "Tercera",
      "Primera",
    ]);
  });

  it("pagina el filtro playlist_id (offset/limit sobre position) con total propio", async () => {
    const user = await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Paginación Playlist");
    const album = await createAlbum(client, artist.id);
    const playlistId = crypto.randomUUID();
    await createDb(testConfig()).insert(playlists).values({
      id: playlistId,
      name: "Paginada",
      isPublic: false,
      ownerId: user.id,
    });

    const created: SongRead[] = [];
    for (const [index, title] of ["P0", "P1", "P2", "P3"].entries()) {
      created.push(
        await createSong(client, {
          title,
          artistId: artist.id,
          albumId: album.id,
          objectKey: `songs/pag${index}.mp3`,
        }),
      );
    }
    // Posición explícita = índice del array (el orden de creación NO manda).
    await createDb(testConfig())
      .insert(playlistSongs)
      .values(
        created.map((song, index) => ({
          playlistId,
          songId: song.id,
          position: index,
        })),
      );

    const page = await readJson<{
      items: SongRead[];
      total: number;
      offset: number;
      limit: number;
    }>(await client.get(`/songs?playlist_id=${playlistId}&limit=2&offset=1`));

    // `total` es el de la playlist completa, no el de la página.
    expect(page.total).toBe(4);
    expect(page.offset).toBe(1);
    expect(page.limit).toBe(2);
    // offset 1 + limit 2 = posiciones 1 y 2.
    expect(page.items.map((song) => song.title)).toEqual(["P1", "P2"]);
  });

  it("`total` con collaborator_id cuenta las colaboraciones, no la página", async () => {
    await registerAndLogin(client, { admin: true });
    const main = await createArtist(client, "Total Principal");
    const guest = await createArtist(client, "Total Invitado");
    const album = await createAlbum(client, main.id);

    for (const [index, title] of ["Colab 1", "Colab 2"].entries()) {
      await createSong(client, {
        title,
        artistId: main.id,
        albumId: album.id,
        objectKey: `songs/total-colab-${index}.mp3`,
        collaboratorIds: [guest.id],
      });
    }
    // Sin el invitado: no debe entrar en el total.
    await createSong(client, {
      title: "Solo Principal",
      artistId: main.id,
      albumId: album.id,
      objectKey: "songs/total-solo.mp3",
    });

    const page = await readJson<{ items: SongRead[]; total: number }>(
      await client.get(`/songs?collaborator_id=${guest.id}&limit=1`),
    );
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.collaborators?.map((artist) => artist.id)).toEqual([
      guest.id,
    ]);
  });

  it("canción legacy sin álbum: album y cover_url en null", async () => {
    // Cliente con base pública de R2: así el `cover_url` null prueba que NO hay
    // álbum, no que falte configuración.
    const withR2 = createClient(testBindings({ R2_PUBLIC_BASE_URL: R2_BASE }));
    await registerAndLogin(withR2, { admin: true });
    const artist = await createArtist(withR2, "Legacy Sin Álbum");

    // Fila directa: la API ya no permite crear canciones sin álbum.
    const songId = crypto.randomUUID();
    await createDb(testConfig()).insert(songs).values({
      id: songId,
      title: "Huérfana Legacy",
      artistId: artist.id,
      albumId: null,
      objectKey: "songs/legacy-sin-album.mp3",
    });

    const detail = await readJson<SongRead>(await withR2.get(`/songs/${songId}`));
    expect(detail.album).toBeNull();
    expect(detail.cover_url).toBeNull();
    expect(detail.artist.id).toBe(artist.id);

    const list = await readJson<{ items: SongRead[]; total: number }>(
      await withR2.get(`/songs?q=${encodeURIComponent("huérfana legacy")}`),
    );
    expect(list.total).toBe(1);
    expect(list.items[0]?.album).toBeNull();
    expect(list.items[0]?.cover_url).toBeNull();
  });

  it("/songs/popular: ranking por plays de la ventana", async () => {
    const user = await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Popular Artist");
    const album = await createAlbum(client, artist.id);
    const [s1, s2, s3] = [
      await createSong(client, {
        title: "Uno",
        artistId: artist.id,
        albumId: album.id,
        objectKey: "songs/pop1.mp3",
      }),
      await createSong(client, {
        title: "Dos",
        artistId: artist.id,
        albumId: album.id,
        objectKey: "songs/pop2.mp3",
      }),
      await createSong(client, {
        title: "Tres",
        artistId: artist.id,
        albumId: album.id,
        objectKey: "songs/pop3.mp3",
      }),
    ];

    // s1 se toca 3 veces no consecutivas, s2 dos, s3 ninguna.
    for (const song of [s1!, s2!, s1!, s2!, s1!]) {
      await insertListen(user.id, song.id);
    }

    const response = await client.get("/songs/popular");
    expect(response.status).toBe(200);
    const items = await readJson<SongRead[]>(response);
    // Solo canciones con plays: s1 (3) > s2 (2)
    expect(items.map((song) => song.id)).toEqual([s1!.id, s2!.id]);
    expect(items[0]?.play_count).toBe(3);
    expect(items[1]?.play_count).toBe(2);
    // El payload es un SongRead completo (artist + album + colaboradores).
    expect(items[0]?.artist.name).toBe("Popular Artist");
    expect(items[0]?.album?.id).toBe(album.id);
    expect(items[0]?.collaborators).toEqual([]);
    // `play_count` es el count de la VENTANA, no `songs.play_count` (sigue 0).
    expect((await readJson<SongRead>(await client.get(`/songs/${s1!.id}`))).play_count).toBe(
      0,
    );
    // "popular" se registró antes de /{song_id}: no se parsea como uuid.
    expect(items.some((song) => song.id === s3!.id)).toBe(false);
  });

  it("/songs/popular: respeta limit y days", async () => {
    const user = await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Ventana Artist");
    const album = await createAlbum(client, artist.id);
    const songs: SongRead[] = [];
    for (const [index, title] of ["W1", "W2", "W3"].entries()) {
      songs.push(
        await createSong(client, {
          title,
          artistId: artist.id,
          albumId: album.id,
          objectKey: `songs/w${index + 1}.mp3`,
        }),
      );
    }
    for (const song of songs) await insertListen(user.id, song.id);
    // Un play viejo (40 días) de W3: fuera de la ventana por defecto (30 días).
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await insertListen(user.id, songs[2]!.id, old);

    const limited = await client.get("/songs/popular?limit=2");
    expect(limited.status).toBe(200);
    expect((await readJson<SongRead[]>(limited)).length).toBe(2);

    // Ventana de 1 día incluye los plays de recién (misma corrida)
    const day = await client.get("/songs/popular?days=1");
    expect((await readJson<SongRead[]>(day)).length).toBe(3);

    // Ventana por defecto (30 días): W3 solo conserva su play reciente
    const defaults = await readJson<SongRead[]>(
      await client.get("/songs/popular"),
    );
    expect(defaults.find((song) => song.id === songs[2]!.id)?.play_count).toBe(1);

    // Ventana larga: W3 recupera los 2 plays
    const wide = await readJson<SongRead[]>(
      await client.get("/songs/popular?days=365"),
    );
    expect(wide.find((song) => song.id === songs[2]!.id)?.play_count).toBe(2);
  });

  it("/songs/popular: month=true usa el mes calendario UTC", async () => {
    const user = await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Mes Artist");
    const album = await createAlbum(client, artist.id);
    const song = await createSong(client, {
      title: "De Este Mes",
      artistId: artist.id,
      albumId: album.id,
      objectKey: "songs/month.mp3",
    });
    await insertListen(user.id, song.id);
    // Play del mes anterior (si estamos día 1, este mes y el anterior difieren
    // igual: el corte es el día 1 a las 00:00 UTC).
    const previousMonth = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 15),
    );
    await insertListen(user.id, song.id, previousMonth);

    const response = await client.get("/songs/popular?month=true");
    expect(response.status).toBe(200);
    const items = await readJson<SongRead[]>(response);
    const item = items.find((candidate) => candidate.id === song.id);
    expect(item?.play_count).toBe(1);

    // Contraste: la ventana de días sí incluye el play del mes pasado.
    const wide = await readJson<SongRead[]>(
      await client.get("/songs/popular?days=60"),
    );
    expect(wide.find((candidate) => candidate.id === song.id)?.play_count).toBe(
      2,
    );
  });

  it("`limit`/`days` fuera de rango o no-uuid -> 422", async () => {
    for (const query of [
      "/songs?artist_id=no-es-uuid",
      "/songs?collaborator_id=no-es-uuid",
      "/songs?album_id=no-es-uuid",
      "/songs?playlist_id=no-es-uuid",
      "/songs/popular?limit=0",
      "/songs/popular?limit=51",
      "/songs/popular?days=0",
      "/songs/popular?days=366",
    ]) {
      expect((await client.get(query)).status).toBe(422);
    }
  });

  it("mutaciones sin sesión -> 401; usuario normal -> 403", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Protegido Songs");
    const album = await createAlbum(client, artist.id);
    const song = await createSong(client, {
      title: "Protegida",
      artistId: artist.id,
      albumId: album.id,
      objectKey: "songs/protegida.mp3",
    });

    const anonymous = createClient();
    expect((await anonymous.del(`/songs/${song.id}`)).status).toBe(401);
    expect(
      (await anonymous.patchJson(`/songs/${song.id}`, { title: "X" })).status,
    ).toBe(401);

    const normal = createClient();
    await registerAndLogin(normal);
    expect((await normal.del(`/songs/${song.id}`)).status).toBe(403);
    expect(
      (await normal.patchJson(`/songs/${song.id}`, { title: "Y" })).status,
    ).toBe(403);
  });

  it("PATCH/DELETE de una canción inexistente -> 404", async () => {
    await registerAndLogin(client, { admin: true });
    const missing = crypto.randomUUID();

    const patched = await client.patchJson(`/songs/${missing}`, {
      title: "Nadie",
    });
    expect(patched.status).toBe(404);
    expect(await readJson(patched)).toEqual({
      detail: `Canción ${missing} no existe`,
    });
    expect((await client.del(`/songs/${missing}`)).status).toBe(404);
  });
});
