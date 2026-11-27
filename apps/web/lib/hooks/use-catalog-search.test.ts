import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Album, Artist } from "@/lib/services/types";

import { useCatalogSearch } from "./use-catalog-search";

const mocks = vi.hoisted(() => ({
  getArtists: vi.fn(),
  getAlbums: vi.fn(),
}));

vi.mock("@/lib/services/artists-service", () => ({
  artistsService: {
    getArtists: mocks.getArtists,
  },
}));

vi.mock("@/lib/services/albums-service", () => ({
  albumsService: {
    getAlbums: mocks.getAlbums,
  },
}));

function makeArtist(id: string, name: string): Artist {
  return {
    id,
    name,
    bio: null,
    image_url: null,
    cover_key: null,
    created_at: "2026-01-01T00:00:00Z",
  } as Artist;
}

function makeAlbum(id: string, title: string, artist: Artist): Album {
  return {
    id,
    title,
    artist: { id: artist.id, name: artist.name },
    cover_url: null,
    cover_key: null,
    created_at: "2026-01-01T00:00:00Z",
  } as Album;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useCatalogSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips initial empty mount and performs debounced artist search merged with initialArtists", async () => {
    const initialArtist = makeArtist("art-1", "Charly García");
    const remoteArtist = makeArtist("art-2", "Soda Stereo");
    const req = deferred<{ items: Artist[]; total: number; offset: number; limit: number }>();
    mocks.getArtists.mockReturnValueOnce(req.promise);

    const { result } = renderHook(() =>
      useCatalogSearch({
        initialArtists: [initialArtist],
        initialAlbums: [],
      })
    );

    // Initial mount with empty query does not fetch artists or albums.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(mocks.getArtists).not.toHaveBeenCalled();
    expect(mocks.getAlbums).not.toHaveBeenCalled();
    expect(result.current.artistsLoading).toBe(false);

    // Typing a query debounces for 250ms before triggering the API call.
    act(() => {
      result.current.setArtistQuery("soda");
    });
    expect(mocks.getArtists).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(mocks.getArtists).toHaveBeenCalledWith({ query: "soda", limit: 50 });
    expect(result.current.artistsLoading).toBe(true);

    await act(async () => {
      req.resolve({ items: [remoteArtist], total: 1, offset: 0, limit: 50 });
      await req.promise;
    });

    expect(result.current.artistsLoading).toBe(false);
    expect(result.current.artists.map((a) => a.id)).toEqual(["art-2", "art-1"]);
  });

  it("ignores stale artist responses when a newer search finishes first", async () => {
    const initialArtist = makeArtist("art-1", "Charly García");
    const staleArtist = makeArtist("art-stale", "Stale Result");
    const freshArtist = makeArtist("art-fresh", "Fresh Result");

    const firstReq = deferred<{ items: Artist[]; total: number; offset: number; limit: number }>();
    const secondReq = deferred<{ items: Artist[]; total: number; offset: number; limit: number }>();
    mocks.getArtists.mockReturnValueOnce(firstReq.promise).mockReturnValueOnce(secondReq.promise);

    const { result } = renderHook(() =>
      useCatalogSearch({
        initialArtists: [initialArtist],
        initialAlbums: [],
      })
    );

    act(() => {
      result.current.setArtistQuery("old");
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(mocks.getArtists).toHaveBeenCalledTimes(1);

    // Start a second search before the first resolves.
    act(() => {
      result.current.setArtistQuery("new");
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(mocks.getArtists).toHaveBeenCalledTimes(2);

    // Newer request resolves first.
    await act(async () => {
      secondReq.resolve({ items: [freshArtist], total: 1, offset: 0, limit: 50 });
      await secondReq.promise;
    });
    expect(result.current.artistsLoading).toBe(false);
    expect(result.current.artists.map((a) => a.id)).toEqual(["art-fresh", "art-1"]);

    // Older request resolves late and must be ignored.
    await act(async () => {
      firstReq.resolve({ items: [staleArtist], total: 1, offset: 0, limit: 50 });
      await firstReq.promise;
    });
    expect(result.current.artists.map((a) => a.id)).toEqual(["art-fresh", "art-1"]);
  });

  it("fetches artist-scoped albums on artistId/albumQuery change and ignores stale album responses", async () => {
    const artist1 = makeArtist("art-1", "Soda Stereo");
    const artist2 = makeArtist("art-2", "Gustavo Cerati");
    const initialAlbum = makeAlbum("alb-init", "Signos", artist1);
    const staleAlbum = makeAlbum("alb-stale", "Dynamo", artist1);
    const freshAlbum = makeAlbum("alb-fresh", "Bocanada", artist2);

    const req1 = deferred<{ items: Album[]; total: number; offset: number; limit: number }>();
    const req2 = deferred<{ items: Album[]; total: number; offset: number; limit: number }>();
    mocks.getAlbums.mockReturnValueOnce(req1.promise).mockReturnValueOnce(req2.promise);

    const { result, rerender } = renderHook(
      ({ artistId }: { artistId?: string }) =>
        useCatalogSearch({
          initialArtists: [artist1, artist2],
          initialAlbums: [initialAlbum],
          artistId,
        }),
      { initialProps: { artistId: "art-1" } }
    );

    expect(mocks.getAlbums).toHaveBeenCalledWith({
      query: undefined,
      artistId: "art-1",
      limit: 50,
    });
    expect(result.current.albumsLoading).toBe(true);

    // Switch artistId before the first album request resolves.
    rerender({ artistId: "art-2" });
    expect(mocks.getAlbums).toHaveBeenCalledWith({
      query: undefined,
      artistId: "art-2",
      limit: 50,
    });

    await act(async () => {
      req2.resolve({ items: [freshAlbum], total: 1, offset: 0, limit: 50 });
      await req2.promise;
    });
    expect(result.current.albumsLoading).toBe(false);
    expect(result.current.albums.map((a) => a.id)).toEqual(["alb-fresh", "alb-init"]);

    // Stale album response for art-1 resolves late and is ignored.
    await act(async () => {
      req1.resolve({ items: [staleAlbum], total: 1, offset: 0, limit: 50 });
      await req1.promise;
    });
    expect(result.current.albums.map((a) => a.id)).toEqual(["alb-fresh", "alb-init"]);
  });

  it("retains selected remote items when search resets to empty and reports loading on re-fetch", async () => {
    const initialArtist = makeArtist("art-init", "Charly García");
    const remoteArtist = makeArtist("art-remote", "Pescado Rabioso");
    const initialAlbum = makeAlbum("alb-init", "Clics Modernos", initialArtist);
    const remoteAlbum = makeAlbum("alb-remote", "Artaud", remoteArtist);

    mocks.getArtists
      .mockResolvedValueOnce({ items: [remoteArtist], total: 1, offset: 0, limit: 50 })
      .mockResolvedValueOnce({ items: [initialArtist], total: 1, offset: 0, limit: 50 });

    const reqAlbum1 = deferred<{ items: Album[]; total: number; offset: number; limit: number }>();
    const reqAlbum2 = deferred<{ items: Album[]; total: number; offset: number; limit: number }>();
    const reqAlbum3 = deferred<{ items: Album[]; total: number; offset: number; limit: number }>();
    mocks.getAlbums
      .mockReturnValueOnce(reqAlbum1.promise)
      .mockReturnValueOnce(reqAlbum2.promise)
      .mockReturnValueOnce(reqAlbum3.promise);

    const { result, rerender } = renderHook(
      ({
        artistId,
        selectedArtistId,
        selectedAlbumId,
      }: {
        artistId?: string;
        selectedArtistId?: string;
        selectedAlbumId?: string;
      }) =>
        useCatalogSearch({
          initialArtists: [initialArtist],
          initialAlbums: [initialAlbum],
          artistId,
          selectedArtistId,
          selectedAlbumId,
        }),
      {
        initialProps: {
          artistId: undefined as string | undefined,
          selectedArtistId: undefined as string | undefined,
          selectedAlbumId: undefined as string | undefined,
        },
      }
    );

    // Search for remote artist and select it.
    act(() => {
      result.current.setArtistQuery("pescado");
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.artists.map((a) => a.id)).toContain("art-remote");

    rerender({
      artistId: "art-remote",
      selectedArtistId: "art-remote",
      selectedAlbumId: undefined,
    });

    // Resolve album search for art-remote and select remote album.
    await act(async () => {
      reqAlbum1.resolve({ items: [remoteAlbum], total: 1, offset: 0, limit: 50 });
      await reqAlbum1.promise;
    });

    rerender({
      artistId: "art-remote",
      selectedArtistId: "art-remote",
      selectedAlbumId: "alb-remote",
    });

    // Reset artist search query to "" (e.g. Select closed); selected remote artist must remain.
    act(() => {
      result.current.setArtistQuery("");
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.artists.map((a) => a.id)).toEqual(["art-init", "art-remote"]);

    // Filter albums to something else, then reset albumQuery to "" and verify loading is true on re-fetch.
    act(() => {
      result.current.setAlbumQuery("other");
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.albumsLoading).toBe(true);
    await act(async () => {
      reqAlbum2.resolve({ items: [], total: 0, offset: 0, limit: 50 });
      await reqAlbum2.promise;
    });
    expect(result.current.albumsLoading).toBe(false);
    expect(result.current.albums.map((a) => a.id)).toContain("alb-remote");

    // Re-fetch previously settled empty album query for the same artistId.
    act(() => {
      result.current.setAlbumQuery("");
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.albumsLoading).toBe(true);
    await act(async () => {
      reqAlbum3.resolve({ items: [remoteAlbum], total: 1, offset: 0, limit: 50 });
      await reqAlbum3.promise;
    });
    expect(result.current.albumsLoading).toBe(false);
  });
});
