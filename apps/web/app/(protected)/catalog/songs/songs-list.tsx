"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { SongItem } from "@/components/song-item";
import { SongItemSkeleton } from "@/components/loading-skeletons";
import { Button } from "@/components/ui";
import { favoritesService } from "@/lib/services/favorites-service";
import type { UserLibrary } from "@/lib/services/library";
import type { Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

const PAGE_LIMIT = 20;

interface SongsListProps {
  library: UserLibrary | null;
  onMutated?: () => Promise<void>;
}

/**
 * Lista completa de canciones agregadas (favoritos) con infinite scroll:
 * un sentinel observado con IntersectionObserver pide la página siguiente
 * (`GET /me/favorites`, offset/limit de a 20) y la appendea. Sin librerías
 * extra: el observer es nativo.
 */
export function SongsList({ library, onMutated }: SongsListProps) {
  const [songs, setSongs] = React.useState<Song[]>([]);
  const [total, setTotal] = React.useState(0);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  // Offset del próximo fetch: evita closures viejos en el observer.
  const offsetRef = React.useRef(0);

  const hasMore = songs.length < total;

  // Carga inicial (página 0). `reloadKey` permite reintentar tras un error.
  React.useEffect(() => {
    let cancelled = false;
    favoritesService
      .getFavorites({ offset: 0, limit: PAGE_LIMIT })
      .then((page) => {
        if (cancelled) return;
        setSongs(page.items);
        setTotal(page.total);
        offsetRef.current = page.items.length;
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err));
      })
      .finally(() => {
        if (!cancelled) setInitialLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await favoritesService.getFavorites({
        offset: offsetRef.current,
        limit: PAGE_LIMIT,
      });
      offsetRef.current += page.items.length;
      setSongs((prev) => [...prev, ...page.items]);
      setTotal(page.total);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoadingMore(false);
    }
  }

  // El observer llama a la versión más reciente de `loadMore` vía ref (evita
  // closures viejos y re-observar en cada render). El ref se actualiza en un
  // effect (regla del React Compiler: no tocar refs durante el render).
  const loadMoreRef = React.useRef(loadMore);
  React.useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  // Sentinel: al entrar en viewport (con margen de 300px) carga la página
  // siguiente. Se re-observa cuando cambia el estado de carga.
  React.useEffect(() => {
    if (initialLoading || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMoreRef.current();
      },
      { rootMargin: "300px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [initialLoading, hasMore, loadingMore]);

  // Carga inicial: skeletons (el loading.tsx cubre la entrada server-side).
  if (initialLoading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <SongItemSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Error en la carga inicial: reintentar sin perder la página.
  if (error && songs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-12 text-center">
        <p className="text-sm text-text-subdued">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            setInitialLoading(true);
            setReloadKey((k) => k + 1);
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  // Estado vacío: sin favoritos todavía.
  if (songs.length === 0) {
    return (
      <div className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-12 text-center">
        <p className="font-display text-lg">Todavía no guardaste canciones.</p>
        <p className="mt-1 text-sm text-text-subdued">
          Tocá el ♥ en cualquier canción del catálogo y aparece acá.
        </p>
        <Link
          href="/songs"
          className="mt-5 inline-block rounded-pill bg-brand-400 px-6 py-2.5 text-sm font-semibold text-bg-base transition-colors hover:bg-brand-200"
        >
          Explorar canciones
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ul className="space-y-2.5">
        {songs.map((song) => (
          <SongItem
            key={song.id}
            song={song}
            queue={songs}
            favoriteIds={library?.favoriteIds}
            playlists={library?.playlists}
            onMutated={onMutated}
          />
        ))}
      </ul>

      {/* Sentinel del infinite scroll */}
      <div ref={sentinelRef} className="flex items-center justify-center gap-3 py-4">
        {loadingMore && (
          <Loader2 size={20} className="animate-spin text-brand-400" aria-hidden />
        )}
        {!hasMore && (
          <p className="text-xs text-text-subdued">
            {songs.length} {songs.length === 1 ? "canción" : "canciones"} · llegaste
            al final
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-brand-900/30 px-3.5 py-2.5 text-center text-sm text-brand-200">
          {error}
        </p>
      )}
    </div>
  );
}