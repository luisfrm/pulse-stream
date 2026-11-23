import {
  CarouselSkeleton,
  SongItemSkeleton,
} from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

/**
 * Skeleton del artista con la estructura nueva: hero brand (el cover real
 * todavía no se conoce) → Populares (filas) → Discografía (carrusel) →
 * "Incluye a {artista}" (shelf).
 */
export default function ArtistLoading() {
  return (
    <div className="flex flex-col gap-10">
      <section className="bg-brand-gradient relative -mx-4 overflow-hidden px-6 py-12 lg:-mx-8">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="h-3 w-20" variant="brand" />
          <Skeleton className="mt-3 h-12 w-2/3 max-w-md" variant="brand" />
          <Skeleton className="mt-3 h-4 w-48" variant="brand" />
        </div>
      </section>

      <div className="space-y-10">
        <section>
          <Skeleton className="h-6 w-40" />
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 5 }).map((_, index) => (
              <SongItemSkeleton key={index} />
            ))}
          </div>
        </section>

        <CarouselSkeleton title="Discografía" />

        <CarouselSkeleton />
      </div>
    </div>
  );
}
