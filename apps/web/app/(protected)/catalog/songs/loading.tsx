import { SongItemSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

/** Skeleton de "Tus canciones": header + lista de filas (espejo de la página). */
export default function CatalogSongsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <Skeleton className="h-10 w-56" />
        <Skeleton className="mt-2 h-4 w-80" />
      </header>

      <div className="space-y-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <SongItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}