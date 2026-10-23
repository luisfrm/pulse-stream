/**
 * Integración de `/artists` (espejo de `apps/api/tests/test_artists.py`).
 *
 * Listado público ordenado por nombre, mutaciones solo admin, unicidad de
 * nombre case-insensitive (409) y 404 con el detail exacto de Python.
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
import { createArtist } from "./catalog-helpers";
import type { ArtistRead } from "@/schemas";

const ADMIN_REQUIRED = "Requiere permisos de administrador";

describeDb("artists", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("listado vacío: página por defecto", async () => {
    const response = await client.get("/artists");

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      items: [],
      total: 0,
      offset: 0,
      limit: 50,
    });
  });

  it("crear sin sesión -> 401", async () => {
    const response = await client.postJson("/artists", { name: "Soda Stereo" });

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ detail: "Unauthorized" });
  });

  it("usuario normal no puede crear artistas -> 403", async () => {
    await registerAndLogin(client);

    const response = await client.postJson("/artists", { name: "Soda Stereo" });

    expect(response.status).toBe(403);
    expect(await readJson(response)).toEqual({ detail: ADMIN_REQUIRED });
  });

  it("crear, listar, buscar y obtener por id", async () => {
    await registerAndLogin(client, { admin: true });

    const created = await client.postJson("/artists", { name: "Soda Stereo" });
    expect(created.status).toBe(201);
    const artist = await readJson<ArtistRead>(created);
    expect(artist.name).toBe("Soda Stereo");
    expect(artist.id).toBeTruthy();
    // `cover_url` null cuando R2_PUBLIC_BASE_URL no está configurado.
    expect(artist.cover_key ?? null).toBeNull();

    // Nombre duplicado (mismo casing y distinto) -> 409
    for (const name of ["Soda Stereo", "soda stereo"]) {
      const duplicate = await client.postJson("/artists", { name });
      expect(duplicate.status).toBe(409);
    }
    expect(
      await readJson(await client.postJson("/artists", { name: "SODA STEREO" })),
    ).toEqual({ detail: "Ya existe un artista llamado 'SODA STEREO'" });

    // Búsqueda case-insensitive sobre el nombre
    const search = await client.get("/artists?q=soda");
    expect(search.status).toBe(200);
    const page = await readJson<{ items: ArtistRead[]; total: number }>(search);
    expect(page.total).toBe(1);
    expect(page.items[0]?.name).toBe("Soda Stereo");

    // Get por id
    const byId = await client.get(`/artists/${artist.id}`);
    expect(byId.status).toBe(200);
    expect((await readJson<ArtistRead>(byId)).name).toBe("Soda Stereo");

    // Get inexistente -> 404 con el detail de Python
    const missing = crypto.randomUUID();
    const notFound = await client.get(`/artists/${missing}`);
    expect(notFound.status).toBe(404);
    expect(await readJson(notFound)).toEqual({
      detail: `Artista ${missing} no existe`,
    });
  });

  it("ordena por nombre asc y pagina con offset/limit", async () => {
    await registerAndLogin(client, { admin: true });
    // Nombres con el mismo casing: el orden es el mismo con cualquier collation
    // de Postgres (C o en_US), a diferencia de mezclar mayúsculas/minúsculas.
    for (const name of ["gamma", "alfa", "beta"]) {
      await createArtist(client, name);
    }

    const all = await client.get("/artists");
    const page = await readJson<{ items: ArtistRead[]; total: number }>(all);
    expect(page.total).toBe(3);
    expect(page.items.map((artist) => artist.name)).toEqual([
      "alfa",
      "beta",
      "gamma",
    ]);

    const sliced = await readJson<{ items: ArtistRead[]; total: number }>(
      await client.get("/artists?offset=1&limit=1"),
    );
    expect(sliced.total).toBe(3);
    expect(sliced.items.map((artist) => artist.name)).toEqual(["beta"]);
  });

  it("actualiza y borra un artista", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Café Tacvba");

    const patched = await client.patchJson(`/artists/${artist.id}`, {
      name: "Café Tacuba",
    });
    expect(patched.status).toBe(200);
    expect((await readJson<ArtistRead>(patched)).name).toBe("Café Tacuba");

    const deleted = await client.del(`/artists/${artist.id}`);
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");

    expect((await client.get(`/artists/${artist.id}`)).status).toBe(404);
  });

  it("PATCH valida duplicados excluyendo al propio artista", async () => {
    await registerAndLogin(client, { admin: true });
    const first = await createArtist(client, "Primero");
    const second = await createArtist(client, "Segundo");

    // Mismo nombre del propio artista (mismo casing o distinto) -> 200
    expect(
      (await client.patchJson(`/artists/${first.id}`, { name: "primero" }))
        .status,
    ).toBe(200);

    // Nombre de otro artista -> 409
    const clash = await client.patchJson(`/artists/${first.id}`, {
      name: "SEGUNDO",
    });
    expect(clash.status).toBe(409);
    expect(await readJson(clash)).toEqual({
      detail: "Ya existe un artista llamado 'SEGUNDO'",
    });

    // El artista original sigue intacto
    const stored = await readJson<ArtistRead>(await client.get(`/artists/${second.id}`));
    expect(stored.name).toBe("Segundo");
  });

  it("aplica solo los campos enviados en PATCH", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Solo Nombre");

    const patched = await client.patchJson(`/artists/${artist.id}`, {
      image_url: "https://img.example.test/a.png",
    });
    expect(patched.status).toBe(200);
    const body = await readJson<ArtistRead>(patched);
    expect(body.name).toBe("Solo Nombre");
    expect(body.image_url).toBe("https://img.example.test/a.png");
  });

  it("mutaciones sin sesión -> 401; usuario normal -> 403", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Protegido");

    const anonymous = createClient();
    for (const response of [
      await anonymous.patchJson(`/artists/${artist.id}`, { name: "X" }),
      await anonymous.del(`/artists/${artist.id}`),
    ]) {
      expect(response.status).toBe(401);
    }

    const normal = createClient();
    await registerAndLogin(normal);
    for (const response of [
      await normal.patchJson(`/artists/${artist.id}`, { name: "Y" }),
      await normal.del(`/artists/${artist.id}`),
    ]) {
      expect(response.status).toBe(403);
    }
  });

  it("PATCH/DELETE de un artista inexistente -> 404", async () => {
    await registerAndLogin(client, { admin: true });
    const missing = crypto.randomUUID();

    const patched = await client.patchJson(`/artists/${missing}`, {
      name: "Nadie",
    });
    expect(patched.status).toBe(404);
    expect(await readJson(patched)).toEqual({
      detail: `Artista ${missing} no existe`,
    });

    expect((await client.del(`/artists/${missing}`)).status).toBe(404);
  });

  it("borrar un artista cascadea sus álbumes y canciones", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, "Cascada");
    const album = await client.postJson("/albums", {
      title: "Disco",
      artist_id: artist.id,
    });
    const albumId = ((await album.json()) as { id: string }).id;
    const song = await client.postJson("/songs", {
      title: "Tema",
      artist_id: artist.id,
      album_id: albumId,
      object_key: "songs/cascada.mp3",
    });
    const songId = ((await song.json()) as { id: string }).id;

    expect((await client.del(`/artists/${artist.id}`)).status).toBe(204);

    expect((await client.get(`/albums/${albumId}`)).status).toBe(404);
    expect((await client.get(`/songs/${songId}`)).status).toBe(404);
  });
});
