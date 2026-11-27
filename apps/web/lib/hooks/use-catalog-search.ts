"use client";

import { useEffect, useMemo, useState } from "react";

import { useDebounce } from "@/lib/hooks/use-debounce";
import { albumsService } from "@/lib/services/albums-service";
import { artistsService } from "@/lib/services/artists-service";
import type { Album, Artist } from "@/lib/services/types";

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 50;

export interface UseCatalogSearchOptions {
  initialArtists: Artist[];
  initialAlbums: Album[];
  artistId?: string;
  selectedArtistId?: string;
  selectedAlbumId?: string;
}

export interface UseCatalogSearchResult {
  artists: Artist[];
  albums: Album[];
  artistsLoading: boolean;
  albumsLoading: boolean;
  setArtistQuery: (query: string) => void;
  setAlbumQuery: (query: string) => void;
}

/** Merges remote results with fallback items by id so selected items are never lost. */
function mergeById<T extends { id: string }>(primary: T[], fallback: T[]): T[] {
  const seen = new Set(primary.map((item) => item.id));
  const merged = [...primary];
  for (const item of fallback) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

/**
 * Provides debounced remote search for artists and artist-scoped albums,
 * merging results with initial server-provided lists, retaining selected remote
 * items across query resets, and ignoring stale responses.
 */
export function useCatalogSearch({
  initialArtists,
  initialAlbums,
  artistId,
  selectedArtistId,
  selectedAlbumId,
}: UseCatalogSearchOptions): UseCatalogSearchResult {
  const [artistQuery, setArtistQuery] = useState("");
  const [artistsTouched, setArtistsTouched] = useState(false);
  const [remoteArtists, setRemoteArtists] = useState<Artist[] | null>(null);
  const [knownArtists, setKnownArtists] = useState<Map<string, Artist>>(() => new Map());
  const [artistsLoading, setArtistsLoading] = useState(false);

  const [albumQuery, setAlbumQuery] = useState("");
  const [remoteAlbums, setRemoteAlbums] = useState<Album[] | null>(null);
  const [knownAlbums, setKnownAlbums] = useState<Map<string, Album>>(() => new Map());
  const [albumsLoading, setAlbumsLoading] = useState(false);

  const debouncedArtistQuery = useDebounce(artistQuery, SEARCH_DEBOUNCE_MS);
  const debouncedAlbumQuery = useDebounce(albumQuery, SEARCH_DEBOUNCE_MS);

  const trimmedArtistQuery = debouncedArtistQuery.trim();
  const shouldFetchArtists = trimmedArtistQuery !== "" || artistsTouched;

  useEffect(() => {
    if (!shouldFetchArtists) return;

    let cancelled = false;
    async function loadArtists() {
      setArtistsLoading(true);
      try {
        const page = await artistsService.getArtists({
          query: trimmedArtistQuery || undefined,
          limit: SEARCH_LIMIT,
        });
        if (!cancelled) {
          setRemoteArtists(page.items);
          setKnownArtists((prev) => {
            const next = new Map(prev);
            for (const item of page.items) next.set(item.id, item);
            return next;
          });
        }
      } catch {
        // Keep existing artist list on transient search errors.
      } finally {
        if (!cancelled) {
          setArtistsTouched(true);
          setArtistsLoading(false);
        }
      }
    }

    void loadArtists();

    return () => {
      cancelled = true;
    };
  }, [shouldFetchArtists, trimmedArtistQuery]);

  const trimmedAlbumQuery = debouncedAlbumQuery.trim();

  useEffect(() => {
    if (!artistId) return;

    let cancelled = false;
    async function loadAlbums() {
      setAlbumsLoading(true);
      try {
        const page = await albumsService.getAlbums({
          query: trimmedAlbumQuery || undefined,
          artistId,
          limit: SEARCH_LIMIT,
        });
        if (!cancelled) {
          setRemoteAlbums(page.items);
          setKnownAlbums((prev) => {
            const next = new Map(prev);
            for (const item of page.items) next.set(item.id, item);
            return next;
          });
        }
      } catch {
        // Keep existing album list on transient search errors.
      } finally {
        if (!cancelled) {
          setAlbumsLoading(false);
        }
      }
    }

    void loadAlbums();

    return () => {
      cancelled = true;
    };
  }, [artistId, trimmedAlbumQuery]);

  const selectedArtist = selectedArtistId ? knownArtists.get(selectedArtistId) : undefined;
  const artists = useMemo(() => {
    const base = remoteArtists
      ? mergeById(remoteArtists, initialArtists)
      : initialArtists;
    return selectedArtist ? mergeById(base, [selectedArtist]) : base;
  }, [remoteArtists, initialArtists, selectedArtist]);

  const selectedAlbum = selectedAlbumId ? knownAlbums.get(selectedAlbumId) : undefined;
  const albums = useMemo(() => {
    const base = remoteAlbums
      ? mergeById(remoteAlbums, initialAlbums)
      : initialAlbums;
    return selectedAlbum ? mergeById(base, [selectedAlbum]) : base;
  }, [remoteAlbums, initialAlbums, selectedAlbum]);

  return {
    artists,
    albums,
    artistsLoading,
    albumsLoading: Boolean(artistId) && albumsLoading,
    setArtistQuery,
    setAlbumQuery,
  };
}
