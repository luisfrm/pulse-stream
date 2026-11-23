import {
  CarouselSkeleton,
  SongItemSkeleton,
} from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

/**
 * Skeleton del artista con la estructura nueva: hero con la foto a la
 * izquierda y la info a la derecha → Discografía (carrusel) → "Incluye a
 * {artista}" (shelf) → Populares (filas) → Colaboraciones (filas).
 */
export default function ArtistLoading() {
  return (
    <div className="flex flex-col gap-10">
      <section className="bg-brand-gradient -mx-4 px-6 py-10 text-bg-base lg:-mx-8 lg:py-12">
        <div className="mx-auto flex max-w-6xl items-end gap-4 sm:gap-6">
          <Skeleton
            className="h-28 w-28 shrink-0 rounded-lg sm:h-40 sm:w-40"
            variant="brand"
          />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-20" variant="brand" />
            <Skeleton className="mt-3 h-10 w-2/3 max-w-md sm:h-12" variant="brand" />
            <Skeleton className="mt-3 h-4 w-40" variant="brand" />
          </div>
        </div>
      </section>

      <div className="space-y-10">
        <CarouselSkeleton title="Discografía" />

        <CarouselSkeleton />

        <section>
          <Skeleton className="h-6 w-40" />
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 5 }).map((_, index) => (
              <SongItemSkeleton key={index} />
            ))}
          </div>
        </section>

        <section>
          <Skeleton className="h-6 w-48" />
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <SongItemSkeleton key={index} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
