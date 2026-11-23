/**
 * Búsqueda (F-B1): `GET /songs?q=` extendido (título, artista principal o
 * colaborador) + `sort=plays`, y `GET /playlists/public?q=`.
 *
 * El arrangement va por `seedCatalogBatch` (un solo batch, sin API): lo que se
 * testea acá es el filtro y el orden, no el alta. Los tests de `/songs` corren
 * sin sesión (el listado es público); los de playlists necesitan usuarios.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { PlaylistRead, SongRead } from "@/schemas";
import { seedCatalogBatch } from "./catalog-helpers";
import {
  createClient,
  describeDb,
  readJson,
  registerAndLogin,
  resetDb,
  type TestClient,
} from "./helpers";
import { addSongToPlaylist, createPlaylist } from "./library-helpers";

interface SongPage {
  items: SongRead[];
  total: number;
}

interface PlaylistPage {
  items: PlaylistRead[];
  total: number;
}

describeDb("search", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  async function searchSongs(q: string, suffix = ""): Promise<SongPage> {
    const response = await client.get(
      `/songs?q=${encodeURIComponent(q)}${suffix}`,
    );
    expect(response.status, await response.clone().text()).toBe(200);
    return readJson<SongPage>(response);
  }

  async function listSongQuery(queryString: string): Promise<SongPage> {
    const response = await client.get(`/songs${queryString}`);
    expect(response.status, await response.clone().text()).toBe(200);
    return readJson<SongPage>(response);
  }

  async function publicFeed(q?: string): Promise<PlaylistPage> {
    const query = q === undefined ? "" : `?q=${encodeURIComponent(q)}`;
    const response = await client.get(`/playlists/public${query}`);
    expect(response.status, await response.clone().text()).toBe(200);
    return readJson<PlaylistPage>(response);
  }

  describe("GET /songs?q=", () => {
    it("matchea por título, por artista principal y por colaborador", async () => {
      // Canción cuyo TÍTULO contiene "Crimen".
      const cerati = await seedCatalogBatch({
        artistName: "Gustavo Cerati",
        songs: [{ title: "Crimen" }],
      });
      // Artista que solo participa como COLABORADOR: ni el título ("Puente")
      // ni el artista principal ("Banda Norte") mencionan "Especial".
      const guest = await seedCatalogBatch({
        artistName: "Invitado Especial",
        songs: [],
      });
      const banda = await seedCatalogBatch({
        artistName: "Banda Norte",
        songs: [{ title: "Puente", collaboratorIds: [guest.artistId] }],
      });

      const byTitle = await searchSongs("Crimen");
      expect(byTitle.items.map((song) => song.id)).toEqual([cerati.songIds[0]!]);
      expect(byTitle.total).toBe(1);

      // El título no dice "Cerati": el match solo puede venir del artista.
      const byArtist = await searchSongs("Cerati");
      expect(byArtist.items.map((song) => song.id)).toEqual([
        cerati.songIds[0]!,
      ]);
      expect(byArtist.total).toBe(1);

      // El match solo puede venir del EXISTS sobre `song_collaborators`.
      const byCollaborator = await searchSongs("Especial");
      expect(byCollaborator.items.map((song) => song.id)).toEqual([
        banda.songIds[0]!,
      ]);
      expect(byCollaborator.total).toBe(1);
    });

    it("es case-insensitive y contains (no solo prefijo)", async () => {
      const seeded = await seedCatalogBatch({ songs: [{ title: "Crimen" }] });

      const lower = await searchSongs("crim");
      expect(lower.items.map((song) => song.id)).toEqual([seeded.songIds[0]!]);

      // "IME" en el medio de "CrIME n": ni prefijo ni case exacto.
      const middle = await searchSongs("IME");
      expect(middle.items.map((song) => song.id)).toEqual([seeded.songIds[0]!]);
    });

    it("el total aplica el mismo filtro que el listado", async () => {
      const seeded = await seedCatalogBatch({
        artistName: "Los Fabulosos",
        songs: [{ title: "Matador" }, { title: "Mal Bicho" }],
      });

      // Dos canciones entran por el nombre del artista (ningún título matchea).
      const page = await searchSongs("Fabulosos");
      expect(page.total).toBe(2);
      expect(page.items).toHaveLength(2);
      expect(page.items.map((song) => song.id).sort()).toEqual(
        [...seeded.songIds].sort(),
      );

      const none = await searchSongs("zzzz-no-existe");
      expect(none.total).toBe(0);
      expect(none.items).toEqual([]);

      // El OR del `q` va agrupado por AND con el resto de los filtros: pedir
      // un artista que NO es el de estas canciones las descarta igual, aunque
      // el `q` matchee por nombre de artista. Si un refactor pierde los
      // paréntesis de la condición, este caso se rompe.
      const other = await seedCatalogBatch({
        artistName: "Otra Banda",
        songs: [{ title: "Otro Tema" }],
      });
      const foreign = await searchSongs(
        "Fabulosos",
        `&artist_id=${other.artistId}`,
      );
      expect(foreign.total).toBe(0);
      expect(foreign.items).toEqual([]);
    });
  });

  describe("GET /songs?sort=", () => {
    it("sort=plays ordena por play_count; sin sort sigue created_at DESC", async () => {
      const seeded = await seedCatalogBatch({
        songs: [
          { title: "Baja", playCount: 1 },
          { title: "Alta", playCount: 9 },
          { title: "Media", playCount: 5 },
        ],
      });
      const [baja, alta, media] = seeded.songIds;

      const byPlays = await readJson<SongPage>(
        await client.get("/songs?sort=plays"),
      );
      expect(byPlays.items.map((song) => song.id)).toEqual([
        alta!,
        media!,
        baja!,
      ]);
      // `play_count` viaja en el DTO, en el mismo orden que el sort.
      expect(byPlays.items.map((song) => song.play_count)).toEqual([9, 5, 1]);

      // Regresión: sin `sort`, created_at DESC (la última sembrada primero).
      const byNewest = await readJson<SongPage>(await client.get("/songs"));
      expect(byNewest.items.map((song) => song.id)).toEqual([
        media!,
        alta!,
        baja!,
      ]);
    });

    it("sort inválido -> 422", async () => {
      expect((await client.get("/songs?sort=bogus")).status).toBe(422);
    });

    it("con playlist_id gana el orden de position (sort se ignora)", async () => {
      const seeded = await seedCatalogBatch({
        songs: [
          { title: "Primera", playCount: 1 },
          { title: "Segunda", playCount: 9 },
          { title: "Tercera", playCount: 5 },
        ],
      });
      const [primera, segunda, tercera] = seeded.songIds;

      await registerAndLogin(client);
      const playlist = await createPlaylist(client, "Orden curado");
      // Posiciones: Segunda (0), Primera (1) — el play_count alto no manda.
      await addSongToPlaylist(client, playlist.id, segunda!);
      await addSongToPlaylist(client, playlist.id, primera!);

      const page = await readJson<SongPage>(
        await client.get(`/songs?playlist_id=${playlist.id}&sort=plays`),
      );
      expect(page.items.map((song) => song.id)).toEqual([segunda!, primera!]);
      expect(page.items.map((song) => song.id)).not.toContain(tercera!);
    });
  });

  describe("GET /songs?genre=", () => {
    it("filtra por género (también cuando la canción tiene varios) y el total coincide", async () => {
      const rock = await seedCatalogBatch({
        songs: [
          { title: "Rock Uno", genres: ["rock"] },
          { title: "Rock Dos", genres: ["rock", "indie"] },
        ],
      });
      await seedCatalogBatch({
        songs: [{ title: "Pop Uno", genres: ["pop"] }],
      });

      const byRock = await listSongQuery("?genre=rock");
      expect(byRock.total).toBe(2);
      expect(byRock.items.map((song) => song.id).sort()).toEqual(
        [...rock.songIds].sort(),
      );

      // El filtro mira los ELEMENTOS del array: la canción con dos géneros
      // también matchea por el segundo.
      const byIndie = await listSongQuery("?genre=indie");
      expect(byIndie.total).toBe(1);
      expect(byIndie.items[0]?.id).toBe(rock.songIds[1]!);

      // Género válido sin canciones: página vacía, total 0.
      const byMetal = await listSongQuery("?genre=metal");
      expect(byMetal.total).toBe(0);
      expect(byMetal.items).toEqual([]);
    });

    it("genre fuera del enum -> 422", async () => {
      expect((await client.get("/songs?genre=reggae")).status).toBe(422);
    });

    it("documenta el URL-encoding de 'r&b' (y la trampa sin encodear)", async () => {
      const rnb = await seedCatalogBatch({
        songs: [{ title: "Slow Jam", genres: ["r&b"] }],
      });

      // `&` separa params: el web tiene que mandar el valor con
      // `encodeURIComponent` → `/songs?genre=r%26b`.
      const encoded = await listSongQuery(
        `?genre=${encodeURIComponent("r&b")}`,
      );
      expect(encoded.total).toBe(1);
      expect(encoded.items[0]?.id).toBe(rnb.songIds[0]!);

      // Sin encodear, la URL se parte en `genre=r` + `b=`: `r` no es un género
      // del enum → 422 (la trampa que el link de la landing debe evitar).
      expect((await client.get("/songs?genre=r&b")).status).toBe(422);
    });

    it("combina genre con q (AND) y respeta sort=plays", async () => {
      const rock = await seedCatalogBatch({
        artistName: "Banda Rock",
        songs: [
          { title: "Lenta", playCount: 1, genres: ["rock"] },
          { title: "Hit", playCount: 9, genres: ["rock"] },
        ],
      });
      await seedCatalogBatch({
        artistName: "Banda Pop",
        // play_count más alto que cualquiera: si el filtro se escapara del
        // AND del `q` (o no aplicara), aparecería primero en `sort=plays`.
        songs: [{ title: "Pop Hit", playCount: 50, genres: ["pop"] }],
      });
      const [lenta, hit] = rock.songIds;

      // `q` matchea por artista en las dos bandas; el género acota a rock.
      const combined = await searchSongs("Banda", "&genre=rock");
      expect(combined.total).toBe(2);
      expect(combined.items.map((song) => song.id).sort()).toEqual(
        [...rock.songIds].sort(),
      );

      // El orden por plays convive con el filtro de género.
      const ranked = await listSongQuery("?genre=rock&sort=plays");
      expect(ranked.items.map((song) => song.id)).toEqual([hit!, lenta!]);
      expect(ranked.total).toBe(2);
    });
  });

  describe("GET /playlists/public?q=", () => {
    it("filtra por nombre (contains) y el total refleja el filtro", async () => {
      await registerAndLogin(client, { admin: true });
      const systemResponse = await client.postJson("/playlists/system", {
        name: "Noche Top",
        query: "new",
      });
      expect(systemResponse.status, await systemResponse.clone().text()).toBe(
        201,
      );
      const system = await readJson<{ id: string }>(systemResponse);

      await registerAndLogin(client); // usuario normal
      await createPlaylist(client, "Noche de Rock", { is_public: true });
      await createPlaylist(client, "Noche Tranquila", { is_public: true });
      await createPlaylist(client, "Privada", { is_public: false });

      // Sin q: feed de siempre, la system primero (y la privada no aparece).
      const all = await publicFeed();
      expect(all.items[0]?.id).toBe(system.id);
      expect(all.items[0]?.kind).toBe("system");
      expect(all.total).toBe(3);

      // Contains case-insensitive sobre `name`. La system también matchea el
      // filtro y sigue primera: `systemFirstOrder` se mantiene CON `q`.
      const filtered = await publicFeed("noche");
      expect(filtered.total).toBe(3);
      expect(filtered.items[0]?.kind).toBe("system");
      expect(filtered.items[0]?.name).toBe("Noche Top");
      expect(filtered.items.map((playlist) => playlist.name).sort()).toEqual([
        "Noche Top",
        "Noche Tranquila",
        "Noche de Rock",
      ]);

      const none = await publicFeed("zzzz-no-existe");
      expect(none.total).toBe(0);
      expect(none.items).toEqual([]);
    });
  });
});
