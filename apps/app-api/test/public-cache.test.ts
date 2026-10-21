import { afterEach, describe, expect, it, vi } from "vitest";

import { signSession } from "../src/auth/session";
import { SONG_ID, songRecord } from "./catalog-fixtures";
import {
  TEST_SECRET,
  buildTestApp,
  fakeCatalog,
  fakeRepository,
  fakeUser,
} from "./helpers";

/**
 * Cache API mínima en memoria (Node no tiene `caches`). Permite verificar que
 * los GETs públicos se cachean y que `/me/*` nunca pasa por la caché.
 */
class MemoryCache {
  private readonly entries = new Map<string, Response>();

  async match(request: string | Request): Promise<Response | undefined> {
    const key = typeof request === "string" ? request : request.url;
    return this.entries.get(key)?.clone();
  }

  async put(request: string | Request, response: Response): Promise<void> {
    const key = typeof request === "string" ? request : request.url;
    this.entries.set(key, response.clone());
  }

  async delete(request: string | Request): Promise<boolean> {
    const key = typeof request === "string" ? request : request.url;
    return this.entries.delete(key);
  }

  async keys(): Promise<string[]> {
    return [...this.entries.keys()];
  }
}

class MemoryCacheStorage {
  private readonly stores = new Map<string, MemoryCache>();

  async open(name: string): Promise<MemoryCache> {
    let store = this.stores.get(name);
    if (!store) {
      store = new MemoryCache();
      this.stores.set(name, store);
    }
    return store;
  }
}

function installCaches(): void {
  (globalThis as { caches?: unknown }).caches = new MemoryCacheStorage();
}

function removeCaches(): void {
  delete (globalThis as { caches?: unknown }).caches;
}

afterEach(() => {
  removeCaches();
});

describe("caché pública (hono/cache)", () => {
  it("dos GETs al mismo /songs ejecutan el repository una sola vez", async () => {
    installCaches();
    const listSongs = vi.fn(async () => ({ items: [], total: 0 }));
    const { app } = buildTestApp({ catalog: fakeCatalog({ listSongs }) });

    const first = await app.request("/songs?limit=5");
    const second = await app.request("/songs?limit=5");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual(await first.json());
    expect(listSongs).toHaveBeenCalledTimes(1);
    expect(first.headers.get("cache-control")).toContain("max-age=60");
    expect(second.headers.get("cache-control")).toContain("max-age=60");
  });

  it("cachea también las rutas con parámetro (/songs/{id})", async () => {
    installCaches();
    const getSongById = vi.fn(async () => songRecord());
    const { app } = buildTestApp({
      catalog: fakeCatalog({ getSongById }),
    });

    const first = await app.request(`/songs/${SONG_ID}`);
    const second = await app.request(`/songs/${SONG_ID}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(getSongById).toHaveBeenCalledTimes(1);
  });

  it("no mezcla queries distintas (la key incluye el query string)", async () => {
    installCaches();
    const listSongs = vi.fn(async () => ({ items: [], total: 0 }));
    const { app } = buildTestApp({ catalog: fakeCatalog({ listSongs }) });

    await app.request("/songs?limit=5");
    await app.request("/songs?limit=10");

    expect(listSongs).toHaveBeenCalledTimes(2);
  });

  it("/me/* nunca se cachea: dos llamadas ejecutan el repository dos veces", async () => {
    installCaches();
    const listFavoriteSongs = vi.fn(async () => ({ items: [], total: 0 }));
    const user = fakeUser();
    const users = fakeRepository({
      getById: async (id) => (id === user.id ? user : null),
    });
    const { app } = buildTestApp({
      users,
      catalog: fakeCatalog({ listFavoriteSongs }),
    });
    const token = await signSession(user.id, TEST_SECRET);

    const first = await app.request("/me/favorites", {
      headers: { cookie: `session=${token}` },
    });
    const second = await app.request("/me/favorites", {
      headers: { cookie: `session=${token}` },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(listFavoriteSongs).toHaveBeenCalledTimes(2);
    expect(first.headers.get("cache-control")).toBeNull();
  });

  it("sin `caches` (tests Node) el middleware es no-op", async () => {
    removeCaches();
    const listSongs = vi.fn(async () => ({ items: [], total: 0 }));
    const { app } = buildTestApp({ catalog: fakeCatalog({ listSongs }) });

    await app.request("/songs");
    await app.request("/songs");

    expect(listSongs).toHaveBeenCalledTimes(2);
  });
});
