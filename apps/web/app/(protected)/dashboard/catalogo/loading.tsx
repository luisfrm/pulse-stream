import { MediaCardSkeleton, SongItemSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

/** Skeleton de Mi catálogo: header + buscador + las 3 secciones reales. */
export default function CatalogoLoading() {
  return (
    <div className="flex flex-col gap-10">
      <header>
        <Skeleton className="h-8 w-52" />
        <Skeleton className="mt-2 h-4 w-72" />
      </header>

      {/* Buscador */}
      <Skeleton className="h-12 w-full max-w-md" />

      {/* Canciones (lista) */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SongItemSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Playlists (grid) */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Álbumes (grid) */}
      <section>
        <Skeleton className="mb-4 h-7 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
