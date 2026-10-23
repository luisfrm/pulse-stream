/**
 * Asserts de covers que NO necesitan R2 (espejo de `apps/api/tests/test_covers.py`).
 *
 * El presign (`POST /uploads/presign-cover`) es de F5; acá se cubre lo que toca
 * a F4: la canción hereda el cover del álbum, el artista acepta `cover_key` del
 * presign y una key fuera del patrón estricto es 422 en escritura (mientras la
 * lectura sigue tolerando keys legacy).
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  createClient,
  describeDb,
  readJson,
  registerAndLogin,
  resetDb,
  testBindings,
  type TestClient,
} from "./helpers";
import { createAlbum, createArtist, createSong } from "./catalog-helpers";
import type { ArtistRead, SongRead } from "@/schemas";

const R2_BASE = "https://cdn.pulse.test";

describeDb("covers (sin R2)", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient(testBindings({ R2_PUBLIC_BASE_URL: R2_BASE }));
  });

  it("la canción hereda el cover del álbum (no tiene cover propio)", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Los Covers");
    // Keys con formato del presign (`covers/{uuid}.webp`): el schema exige el
    // patrón estricto en escritura.
    const albumKey = "covers/11111111-1111-4111-8111-111111111111.webp";
    const artistKey = "covers/22222222-2222-4222-8222-222222222222.webp";

    const albumResponse = await client.postJson("/albums", {
      title: "Disco",
      artist_id: artist.id,
      cover_key: albumKey,
    });
    expect(albumResponse.status).toBe(201);
    const album = await readJson<{ id: string }>(albumResponse);

    const song = await createSong(client, {
      title: "Con Portada",
      artistId: artist.id,
      albumId: album.id,
      objectKey: "songs/cov.mp3",
    });

    expect("cover_key" in song).toBe(false);
    expect(song.cover_url).toBe(`${R2_BASE}/${albumKey}`);

    // asignar cover al artista sigue funcionando
    const patched = await client.patchJson(`/artists/${artist.id}`, {
      cover_key: artistKey,
    });
    expect(patched.status).toBe(200);
    expect((await readJson<ArtistRead>(patched)).cover_key).toBe(artistKey);
  });

  it("la URL de la canción y del álbum coinciden", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Mismo Cover");
    const albumKey = `covers/${crypto.randomUUID()}.webp`;
    const album = await createAlbum(client, artist.id, "Un Cover");
    await client.patchJson(`/albums/${album.id}`, { cover_key: albumKey });

    const song = await createSong(client, {
      title: "Misma Imagen",
      artistId: artist.id,
      albumId: album.id,
      objectKey: "songs/same-cover.mp3",
    });
    const stored = await readJson<SongRead>(await client.get(`/songs/${song.id}`));

    expect(song.cover_url).toBe(`${R2_BASE}/${albumKey}`);
    expect(stored.cover_url).toBe(song.cover_url);
  });

  it("cover_key fuera del patrón del presign -> 422 en escritura", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Patrón Estricto");

    // POST álbum con .jpg → 422
    const jpg = await client.postJson("/albums", {
      title: "Disco",
      artist_id: artist.id,
      cover_key: "covers/uvst.jpg",
    });
    expect(jpg.status).toBe(422);

    // POST álbum con .webp pero sin UUID → 422
    const noUuid = await client.postJson("/albums", {
      title: "Disco",
      artist_id: artist.id,
      cover_key: "covers/album1.webp",
    });
    expect(noUuid.status).toBe(422);

    // PATCH artista con .jpg → 422
    const artistJpg = await client.patchJson(`/artists/${artist.id}`, {
      cover_key: "covers/artist1.jpg",
    });
    expect(artistJpg.status).toBe(422);

    // PATCH álbum con una key fuera del patrón → 422 (no solo el POST)
    const album = await createAlbum(client, artist.id, "Disco Patch");
    const albumPatch = await client.patchJson(`/albums/${album.id}`, {
      cover_key: "covers/album-patch.jpg",
    });
    expect(albumPatch.status).toBe(422);
    const storedAlbum = await readJson<{ cover_key?: string | null }>(
      await client.get(`/albums/${album.id}`),
    );
    expect(storedAlbum.cover_key ?? null).toBeNull();

    // El artista original sigue sin cover (el PATCH inválido no mutó nada).
    const stored = await readJson<ArtistRead>(
      await client.get(`/artists/${artist.id}`),
    );
    expect(stored.cover_key ?? null).toBeNull();
  });

  it("PATCH /artists con cover_key: null limpia el cover", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Cover Borrable");
    const artistKey = `covers/${crypto.randomUUID()}.webp`;

    const assigned = await client.patchJson(`/artists/${artist.id}`, {
      cover_key: artistKey,
    });
    expect(assigned.status).toBe(200);
    expect((await readJson<ArtistRead>(assigned)).cover_url).toBe(
      `${R2_BASE}/${artistKey}`,
    );

    // El PATCH de artista usa semántica `exclude_unset`: `null` explícito
    // borra la columna (a diferencia de AlbumUpdate, donde se ignora).
    const cleared = await client.patchJson(`/artists/${artist.id}`, {
      cover_key: null,
    });
    expect(cleared.status).toBe(200);
    const body = await readJson<ArtistRead>(cleared);
    expect(body.cover_key ?? null).toBeNull();
    expect(body.cover_url ?? null).toBeNull();
    // El nombre no se tocó.
    expect(body.name).toBe("Cover Borrable");
  });

  it("una key con mayúsculas queda fuera del patrón -> 422", async () => {
    // El patrón es exactamente `^covers/[0-9a-f-]+\.webp$` (igual que Python):
    // el presign genera UUIDs en minúscula, así que `A` no está permitido.
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "UUID Mayúsculas");

    const response = await client.postJson("/albums", {
      title: "Disco",
      artist_id: artist.id,
      cover_key: "covers/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA.webp",
    });
    expect(response.status).toBe(422);
  });
});
