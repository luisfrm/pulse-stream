/**
 * Integración del import por ZIP (espejo de
 * `apps/api/tests/test_album_zip_import.py`).
 *
 * Se inyecta un storage FALSO con `createApp({ storage })`: nunca se llama a
 * R2. El fake registra `(key, bytes, contentType)` para verificar que cada
 * audio se sube antes de crear la fila.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { songs } from "@/db/schema";
import { createApp } from "@/index";
import type { AlbumDetail, SongRead, ZipImportResult } from "@/schemas";
import type { R2Storage } from "@/storage/r2";
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
import {
  buildZip,
  buildZipEntries,
  deflate,
  mp3Bytes,
  mp3WithId3,
  zipFormData,
  zipWith,
} from "./zip-helpers";

const R2_PUBLIC_BASE = "https://cdn.pulse.test";
const COVER_KEY = "covers/66666666-6666-4666-8666-666666666666.webp";
const DB_FAILED = "Error de base de datos al registrar la canción.";
const GENERIC_FAILED = "Error interno al importar el archivo.";
const UNREADABLE = "No se pudo leer el archivo del ZIP.";

/** Storage falso: registra los PUT sin tocar la red. */
class FakeStorage implements R2Storage {
  readonly enabled = true;
  readonly objects: Array<{
    key: string;
    data: Uint8Array;
    contentType: string;
  }> = [];

  presignPut(): Promise<string> {
    return Promise.resolve("https://fake.r2/put");
  }

  putObject(
    key: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<void> {
    this.objects.push({ key, data, contentType });
    return Promise.resolve();
  }
}

/** Storage que falla en el N-ésimo PUT (el resto sigue funcionando). */
class FailingStorage extends FakeStorage {
  private calls = 0;

  constructor(private readonly failOnCall: number) {
    super();
  }

  override putObject(
    key: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<void> {
    this.calls += 1;
    if (this.calls === this.failOnCall) {
      return Promise.reject(new Error("R2 unavailable"));
    }
    return super.putObject(key, data, contentType);
  }
}

/**
 * Storage que simula otro admin creando la canción con la MISMA key justo
 * antes del INSERT (carrera real): el import choca con `ux_songs_object_key`.
 */
class CollidingStorage extends FakeStorage {
  constructor(
    private readonly albumId: string,
    private readonly artistId: string,
  ) {
    super();
  }

  override async putObject(
    key: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<void> {
    await super.putObject(key, data, contentType);
    await createDb(testConfig())
      .insert(songs)
      .values({
        id: crypto.randomUUID(),
        title: `ocupada ${crypto.randomUUID().slice(0, 6)}`,
        artistId: this.artistId,
        albumId: this.albumId,
        objectKey: key,
      });
  }
}

function clientWithStorage(storage: R2Storage, overrides = {}): TestClient {
  return createClient(
    testBindings({ R2_PUBLIC_BASE_URL: R2_PUBLIC_BASE, ...overrides }),
    createApp({ storage }),
  );
}

/** Artista + álbum con cover (nombre único: la base se comparte entre tests). */
async function createAlbumWithCover(
  client: TestClient,
): Promise<{ artist: { id: string }; album: AlbumDetail }> {
  const artistResponse = await client.postJson("/artists", {
    name: `Bad Bunny ${crypto.randomUUID().slice(0, 6)}`,
  });
  expect(artistResponse.status).toBe(201);
  const artist = await readJson<{ id: string }>(artistResponse);

  const albumResponse = await client.postJson("/albums", {
    title: "Un Verano Sin Ti",
    artist_id: artist.id,
    cover_key: COVER_KEY,
  });
  expect(albumResponse.status).toBe(201);
  const album = await readJson<AlbumDetail>(albumResponse);

  return { artist, album };
}

function zipPath(albumId: string): string {
  return `/albums/${albumId}/import-zip`;
}

describeDb("album zip import", () => {
  let storage: FakeStorage;
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    storage = new FakeStorage();
    client = clientWithStorage(storage);
  });

  it("requiere admin (401 sin sesión, 403 usuario normal)", async () => {
    await registerAndLogin(client, { admin: true });
    const { album } = await createAlbumWithCover(client);

    const anonymous = clientWithStorage(storage);
    expect(
      (
        await anonymous.postFormData(
          zipPath(album.id),
          zipFormData(buildZip([])),
        )
      ).status,
    ).toBe(401);

    const normal = clientWithStorage(storage);
    await registerAndLogin(normal);
    expect(
      (await normal.postFormData(zipPath(album.id), zipFormData(buildZip([]))))
        .status,
    ).toBe(403);
  });

  it("crea las canciones con artista y cover del álbum, título desde el nombre", async () => {
    await registerAndLogin(client, { admin: true });
    const { artist, album } = await createAlbumWithCover(client);

    const zip = buildZip([
      // Los tags ID3 se ignoran: el título SIEMPRE sale del filename.
      ["01 - Titulo Uno.mp3", mp3WithId3()],
      ["02 - Titulo Dos.mp3", mp3WithId3()],
      ["Portada.jpg", new TextEncoder().encode("not an image")],
      ["Duplicado.mp3", mp3Bytes()],
      ["Duplicado.mp3", mp3Bytes()],
      ["folder/04 - Cuatro.mp3", mp3Bytes()],
    ]);

    const response = await client.postFormData(zipPath(album.id), zipFormData(zip));
    expect(response.status, await response.clone().text()).toBe(200);
    const data = await readJson<ZipImportResult>(response);

    expect(data.imported?.map((song) => song.title)).toEqual([
      "01 - Titulo Uno",
      "02 - Titulo Dos",
      "Duplicado",
      "04 - Cuatro",
    ]);

    for (const song of data.imported ?? []) {
      expect(song.album?.id).toBe(album.id);
      expect(song.artist.id).toBe(artist.id);
      // Sin cover propio: hereda el del álbum.
      expect("cover_key" in song).toBe(false);
      expect(song.cover_url).toBe(`${R2_PUBLIC_BASE}/${COVER_KEY}`);
      expect(song.duration_seconds).toBe(1);
      expect(song.object_key.startsWith("songs/")).toBe(true);
      expect(song.collaborators).toEqual([]);
      // El álbum anidado no trae song_count calculado (default 0, como Pydantic).
      expect(song.album?.song_count).toBe(0);
    }

    const skipped = new Map(
      (data.skipped ?? []).map((item) => [item.name, item.reason]),
    );
    expect(skipped.get("Portada.jpg")).toBe("No es un archivo .mp3 o .aac.");
    expect(skipped.get("Duplicado.mp3")?.toLowerCase()).toContain("ya existe");
    expect(data.failed).toEqual([]);

    expect(storage.objects).toHaveLength(4);
    expect(
      storage.objects.every((object) => object.contentType === "audio/mpeg"),
    ).toBe(true);
    // La key del objeto es la que quedó en la canción y el UUID es distinto.
    expect(new Set(storage.objects.map((object) => object.key)).size).toBe(4);
  });

  it("ignora el tag ID3 y usa el nombre (título con espacios)", async () => {
    await registerAndLogin(client, { admin: true });
    const { album } = await createAlbumWithCover(client);

    const response = await client.postFormData(
      zipPath(album.id),
      zipFormData(
        zipWith({
          "Malo soy.mp3": mp3WithId3(),
          "Sin Tag.mp3": mp3Bytes(),
        }),
      ),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const data = await readJson<ZipImportResult>(response);
    expect(data.imported?.map((song) => song.title)).toEqual([
      "Malo soy",
      "Sin Tag",
    ]);
    expect(storage.objects).toHaveLength(2);
  });

  it("acepta .aac y lo sube como audio/aac", async () => {
    await registerAndLogin(client, { admin: true });
    const { album } = await createAlbumWithCover(client);

    const response = await client.postFormData(
      zipPath(album.id),
      zipFormData(zipWith({ "track.aac": mp3Bytes() })),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const data = await readJson<ZipImportResult>(response);
    expect(data.imported?.[0]?.title).toBe("track");
    expect(storage.objects).toHaveLength(1);
    expect(storage.objects[0]?.contentType).toBe("audio/aac");
    expect(storage.objects[0]?.key.endsWith(".aac")).toBe(true);
  });

  it("ZIP inválido -> 400 'no es un ZIP válido'", async () => {
    await registerAndLogin(client, { admin: true });
    const { album } = await createAlbumWithCover(client);

    const response = await client.postFormData(
      zipPath(album.id),
      zipFormData(new TextEncoder().encode("this is not a zip")),
    );

    expect(response.status).toBe(400);
    expect((await readJson<{ detail: string }>(response)).detail).toBe(
      "El archivo no es un ZIP válido.",
    );
  });

  it("ZIP con firma PK pero truncado -> 400 'no es un ZIP válido'", async () => {
    await registerAndLogin(client, { admin: true });
    const { album } = await createAlbumWithCover(client);

    const truncated = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
    ]);
    const response = await client.postFormData(
      zipPath(album.id),
      zipFormData(truncated),
    );

    expect(response.status).toBe(400);
    expect((await readJson<{ detail: string }>(response)).detail).toBe(
      "El archivo no es un ZIP válido.",
    );
  });

  it("álbum inexistente -> 404", async () => {
    await registerAndLogin(client, { admin: true });

    const response = await client.postFormData(
      zipPath("00000000-0000-0000-0000-000000000000"),
      zipFormData(buildZip([])),
    );

    expect(response.status).toBe(404);
    expect((await readJson<{ detail: string }>(response)).detail).toBe(
      "Álbum 00000000-0000-0000-0000-000000000000 no existe",
    );
  });

  it("audio no parseable -> failed (y no sube nada)", async () => {
    await registerAndLogin(client, { admin: true });
    const { album } = await createAlbumWithCover(client);

    const response = await client.postFormData(
      zipPath(album.id),
      zipFormData(
        zipWith({
          "fake.mp3": new TextEncoder().encode("this is not audio"),
        }),
      ),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const data = await readJson<ZipImportResult>(response);
    expect(data.imported).toEqual([]);
    expect(data.failed).toHaveLength(1);
    expect(data.failed?.[0]?.reason.toLowerCase()).toContain(
      "no es un audio válido",
    );
    expect(storage.objects).toEqual([]);
  });

  it("entrada cifrada: va a failed y el resto se importa", async () => {
    await registerAndLogin(client, { admin: true });
    const { album } = await createAlbumWithCover(client);

    const response = await client.postFormData(
      zipPath(album.id),
      zipFormData(
        buildZipEntries([
          { name: "cifrado.mp3", payload: mp3Bytes(), encrypted: true },
          { name: "valido.mp3", payload: mp3Bytes() },
        ]),
      ),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const data = await readJson<ZipImportResult>(response);
    expect(data.imported?.map((song) => song.title)).toEqual(["valido"]);
    expect(data.failed).toEqual([{ name: "cifrado.mp3", reason: UNREADABLE }]);
    // Solo se sube el archivo legible.
    expect(storage.objects).toHaveLength(1);
  });

  it("tamaño descomprimido mentido (ZIP bomb) -> failed, no OOM", async () => {
    await registerAndLogin(client, { admin: true });
    const { album } = await createAlbumWithCover(client);

    // Declara 64 bytes y el stream real infla a 1 MB.
    const original = new Uint8Array(1024 * 1024);
    const payload = deflate(original);
    const zip = buildZipEntries([
      {
        name: "bomba.mp3",
        payload,
        method: 8,
        original,
        declaredUncompressedSize: 64,
        declaredCompressedSize: payload.length,
      },
    ]);

    const response = await client.postFormData(zipPath(album.id), zipFormData(zip));

    expect(response.status, await response.clone().text()).toBe(200);
    const data = await readJson<ZipImportResult>(response);
    expect(data.imported).toEqual([]);
    expect(data.failed).toEqual([{ name: "bomba.mp3", reason: UNREADABLE }]);
    expect(storage.objects).toEqual([]);
  });

  it("total descomprimido declarado por encima del tope -> 400", async () => {
    // ZIP chico (entradas deflate) pero con 2 MB declarados descomprimidos.
    const tiny = clientWithStorage(storage, {
      R2_MAX_ZIP_IMPORT_BYTES: String(100 * 1024),
    });
    await registerAndLogin(tiny, { admin: true });
    const { album } = await createAlbumWithCover(tiny);

    const original = new Uint8Array(1024 * 1024);
    const payload = deflate(original);
    const entry = {
      payload,
      method: 8 as const,
      original,
      declaredCompressedSize: payload.length,
      declaredUncompressedSize: original.length,
    };
    const zip = buildZipEntries([
      { name: "a.mp3", ...entry },
      { name: "b.mp3", ...entry },
    ]);
    expect(zip.byteLength).toBeLessThan(100 * 1024);

    const response = await tiny.postFormData(zipPath(album.id), zipFormData(zip));

    expect(response.status).toBe(400);
    expect((await readJson<{ detail: string }>(response)).detail).toBe(
      "El ZIP descomprimido supera el tamaño máximo de 0 MB.",
    );
    expect(storage.objects).toEqual([]);
  });

  it("archivo que supera el máximo por canción -> skipped", async () => {
    // El tope por canción baja a 100 bytes: el MP3 mínimo (834) queda afuera.
    const small = clientWithStorage(storage, { R2_MAX_UPLOAD_BYTES: "100" });
    await registerAndLogin(small, { admin: true });
    const { album } = await createAlbumWithCover(small);

    const response = await small.postFormData(
      zipPath(album.id),
      zipFormData(zipWith({ "big.mp3": mp3Bytes() })),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const data = await readJson<ZipImportResult>(response);
    expect(data.skipped).toHaveLength(1);
    expect(data.skipped?.[0]?.reason).toContain("MB");
    expect(storage.objects).toEqual([]);
  });

  it("título ya existente en el álbum -> skipped (case-insensitive)", async () => {
    await registerAndLogin(client, { admin: true });
    const { artist, album } = await createAlbumWithCover(client);

    const created = await client.postJson("/songs", {
      title: "Título Uno",
      artist_id: artist.id,
      album_id: album.id,
      object_key: `songs/${crypto.randomUUID()}.mp3`,
    });
    expect(created.status).toBe(201);

    const response = await client.postFormData(
      zipPath(album.id),
      zipFormData(zipWith({ "TÍTULO UNO.mp3": mp3Bytes() })),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const data = await readJson<ZipImportResult>(response);
    expect(data.imported).toEqual([]);
    expect(data.skipped).toHaveLength(1);
    expect(data.skipped?.[0]?.reason.toLowerCase()).toContain("ya existe");
    expect(storage.objects).toEqual([]);
  });

  it("duplicados dentro del ZIP comparan sin distinguir mayúsculas", async () => {
    await registerAndLogin(client, { admin: true });
    const { album } = await createAlbumWithCover(client);

    const response = await client.postFormData(
      zipPath(album.id),
      zipFormData(
        zipWith({
          "Título Uno.mp3": mp3Bytes(),
          "TÍTULO UNO.mp3": mp3Bytes(),
        }),
      ),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const data = await readJson<ZipImportResult>(response);
    expect(data.imported).toHaveLength(1);
    expect(data.skipped).toHaveLength(1);
    expect(data.skipped?.[0]?.reason.toLowerCase()).toContain("ya existe");
    expect(storage.objects).toHaveLength(1);
  });

  it("tope de 100 audios por ZIP: el resto va a skipped", async () => {
    await registerAndLogin(client, { admin: true });
    const { album } = await createAlbumWithCover(client);

    // 101 .mp3 con bytes basura: los primeros 100 se procesan (failed por audio
    // inválido, sin tocar la DB) y el 101 queda fuera por el tope.
    const garbage = new TextEncoder().encode("not audio");
    const entries: Array<[string, Uint8Array]> = Array.from(
      { length: 101 },
      (_, index) => [`track-${String(index).padStart(3, "0")}.mp3`, garbage],
    );

    const response = await client.postFormData(
      zipPath(album.id),
      zipFormData(buildZip(entries)),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const data = await readJson<ZipImportResult>(response);
    expect(data.imported).toEqual([]);
    expect(data.failed).toHaveLength(100);
    expect(data.skipped).toHaveLength(1);
    expect(data.skipped?.[0]?.reason).toContain("hasta 100 archivos");
    expect(storage.objects).toEqual([]);
  });

  it("un fallo de storage no aborta el resto (importa 1º y 3º)", async () => {
    const failing = new FailingStorage(2);
    const failingClient = clientWithStorage(failing);
    await registerAndLogin(failingClient, { admin: true });
    const { album } = await createAlbumWithCover(failingClient);

    const response = await failingClient.postFormData(
      zipPath(album.id),
      zipFormData(
        zipWith({
          "a.mp3": mp3Bytes(),
          "b.mp3": mp3Bytes(),
          "c.mp3": mp3Bytes(),
        }),
      ),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const data = await readJson<ZipImportResult>(response);
    expect(data.imported?.map((song) => song.title)).toEqual(["a", "c"]);
    expect(data.failed).toEqual([{ name: "b.mp3", reason: GENERIC_FAILED }]);
    expect(failing.objects).toHaveLength(2);

    // La canción fallida no quedó en la DB.
    const detail = await readJson<AlbumDetail>(
      await failingClient.get(`/albums/${album.id}`),
    );
    expect(detail.songs?.map((song) => song.title).sort()).toEqual(["a", "c"]);
  });

  it("un error de DB se reporta como error de base de datos", async () => {
    await registerAndLogin(client, { admin: true });
    const { artist, album } = await createAlbumWithCover(client);

    // El fake simula otra request que crea la MISMA object_key antes del INSERT
    // (carrera real contra `ux_songs_object_key`).
    const dbClient = clientWithStorage(
      new CollidingStorage(album.id, artist.id),
    );
    await registerAndLogin(dbClient, { admin: true });

    const response = await dbClient.postFormData(
      zipPath(album.id),
      zipFormData(zipWith({ "a.mp3": mp3Bytes() })),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const data = await readJson<ZipImportResult>(response);
    expect(data.imported).toEqual([]);
    expect(data.failed).toEqual([{ name: "a.mp3", reason: DB_FAILED }]);
  });

  it("ZIP que supera el tope configurado -> 400 antes de parsear", async () => {
    const tiny = clientWithStorage(storage, { R2_MAX_ZIP_IMPORT_BYTES: "10" });
    await registerAndLogin(tiny, { admin: true });
    const { album } = await createAlbumWithCover(tiny);

    const response = await tiny.postFormData(
      zipPath(album.id),
      zipFormData(zipWith({ "a.mp3": mp3Bytes() })),
    );

    expect(response.status).toBe(400);
    expect((await readJson<{ detail: string }>(response)).detail).toBe(
      "El ZIP supera el tamaño máximo de 0 MB.",
    );
  });

  it("sin archivo en el body -> 422", async () => {
    await registerAndLogin(client, { admin: true });
    const { album } = await createAlbumWithCover(client);

    const emptyForm = new FormData();
    emptyForm.set("other", "value");
    const noFile = await client.postFormData(zipPath(album.id), emptyForm);
    expect(noFile.status).toBe(422);

    // Body JSON (no multipart) tampoco trae el UploadFile.
    const json = await client.postJson(zipPath(album.id), { file: "x" });
    expect(json.status).toBe(422);
  });

  it("las canciones importadas aparecen en el detalle del álbum", async () => {
    await registerAndLogin(client, { admin: true });
    const { album } = await createAlbumWithCover(client);

    await client.postFormData(
      zipPath(album.id),
      zipFormData(
        zipWith({
          "01 Uno.mp3": mp3Bytes(),
          "02 Dos.mp3": mp3Bytes(),
        }),
      ),
    );

    const detail = await readJson<AlbumDetail>(
      await client.get(`/albums/${album.id}`),
    );
    expect(detail.song_count).toBe(2);
    expect(detail.songs?.map((song: SongRead) => song.title)).toEqual([
      "01 Uno",
      "02 Dos",
    ]);
  });
});
