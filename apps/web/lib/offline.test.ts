import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock de la Cache API con un Map en memoria.
const store = new Map<string, Response>();

// Nombres de caché existentes: la de descargas y la del shell del SW.
const cacheNames = new Set<string>(["pulse-offline-v1", "pulse-shell-v1"]);

const fakeCache: Cache = {
  async match(request: RequestInfo | URL) {
    const key = typeof request === "string" ? request : request.toString();
    return store.get(key);
  },
  async matchAll() {
    return [...store.values()];
  },
  async put(request: RequestInfo | URL, response: Response) {
    const key = typeof request === "string" ? request : request.toString();
    store.set(key, response);
  },
  async delete(request: RequestInfo | URL) {
    const key = typeof request === "string" ? request : request.toString();
    return store.delete(key);
  },
  async keys() {
    return [...store.keys()].map((url) => new Request(url));
  },
  add: vi.fn(),
  addAll: vi.fn(),
};

const fakeCaches = {
  open: async (name: string) => {
    cacheNames.add(name);
    return fakeCache;
  },
  keys: async () => [...cacheNames],
  delete: async (name: string) => cacheNames.delete(name),
};

const fakeSong = {
  id: "abc",
  title: "Crimen",
  artist: { id: "a1", name: "Cerati" },
  stream_url: "https://media.example.com/songs/abc.mp3",
} as Parameters<typeof import("./offline")["saveSong"]>[0];

describe("offline (Cache API)", () => {
  let offline: typeof import("./offline");

  beforeEach(async () => {
    store.clear();
    vi.stubGlobal("caches", fakeCaches);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("audio-bytes", { status: 200 })));
    offline = await import("./offline");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("canCacheOffline es true cuando hay caches y window", async () => {
    expect(offline.canCacheOffline()).toBe(true);
  });

  it("saveSong guarda el fetch completo en la caché", async () => {
    await offline.saveSong(fakeSong);
    expect(await offline.hasSong(fakeSong)).toBe(true);
    expect(store.size).toBe(1);
    const cached = await store.get(fakeSong.stream_url!);
    expect(await cached?.text()).toBe("audio-bytes");
  });

  it("saveSong lanza error si el fetch falla", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("err", { status: 500 }));
    await expect(offline.saveSong(fakeSong)).rejects.toThrow(/No se pudo descargar/);
  });

  it("saveSong lanza error sin stream_url", async () => {
    const songNoUrl = { ...fakeSong, stream_url: null };
    await expect(offline.saveSong(songNoUrl)).rejects.toThrow();
  });

  it("hasSong distingue descargadas de no descargadas", async () => {
    expect(await offline.hasSong(fakeSong)).toBe(false);
    await offline.saveSong(fakeSong);
    expect(await offline.hasSong(fakeSong)).toBe(true);
  });

  it("removeSong borra la canción de la caché", async () => {
    await offline.saveSong(fakeSong);
    await offline.removeSong(fakeSong);
    expect(await offline.hasSong(fakeSong)).toBe(false);
    expect(store.size).toBe(0);
  });

  it("toggleOffline guarda primero y borra después", async () => {
    expect(await offline.toggleOffline(fakeSong)).toBe(true);
    expect(await offline.hasSong(fakeSong)).toBe(true);
    expect(await offline.toggleOffline(fakeSong)).toBe(false);
    expect(await offline.hasSong(fakeSong)).toBe(false);
  });

  it("getSavedSongUrls devuelve las URLs guardadas", async () => {
    await offline.saveSong(fakeSong);
    const urls = await offline.getSavedSongUrls();
    expect(urls).toContain(fakeSong.stream_url);
  });

  it("clearOfflineCache borra la caché de descargas y NO la del shell", async () => {
    expect(cacheNames.has("pulse-offline-v1")).toBe(true);
    expect(cacheNames.has("pulse-shell-v1")).toBe(true);

    await offline.clearOfflineCache();

    expect(cacheNames.has("pulse-offline-v1")).toBe(false);
    expect(cacheNames.has("pulse-shell-v1")).toBe(true);
  });

  it("clearOfflineCache no rompe sin soporte de Cache API", async () => {
    vi.stubGlobal("window", {});
    await expect(offline.clearOfflineCache()).resolves.toBeUndefined();
  });

  it("getOfflineCacheSize suma el peso de las descargas guardadas", async () => {
    await offline.saveSong(fakeSong);
    const size = await offline.getOfflineCacheSize();
    expect(size).toBe("audio-bytes".length);
  });

  it("getOfflineCacheSize devuelve 0 sin descargas", async () => {
    expect(await offline.getOfflineCacheSize()).toBe(0);
  });
});