import { CarouselSkeleton, SongItemSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

/**
 * Skeleton de Explorar: header + input + la landing por defecto ("Populares
 * ahora" en filas, carrusel "Recién llegado", mosaico de géneros). Con `q` la
 * navegación es client-side y suspenden las secciones de resultados, así que
 * este fallback prioriza el estado de entrada (sin búsqueda).
 */
export default function SearchLoading() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-2 h-4 w-80" />
      </header>

      <Skeleton className="h-12 w-full max-w-md" />

      <div className="flex flex-col gap-10">
        <section>
          <Skeleton className="mb-4 h-7 w-40" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <SongItemSkeleton key={index} />
            ))}
          </div>
        </section>

        <CarouselSkeleton title="Recién llegado" />

        <section>
          <Skeleton className="mb-4 h-7 w-48" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
