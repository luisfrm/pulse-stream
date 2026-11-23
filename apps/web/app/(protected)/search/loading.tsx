import {
  CarouselSkeleton,
  SongItemSkeleton,
} from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

/**
 * Skeleton de Explorar: header + input + los 3 bloques (artistas y "Incluye"
 * como carruseles, canciones como filas). Evita caer al FullScreenLoader del
 * grupo en cada navegación.
 */
export default function SearchLoading() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-2 h-4 w-80" />
      </header>

      <Skeleton className="h-12 w-full max-w-md" />

      <CarouselSkeleton title="Artistas" />
      <CarouselSkeleton />

      <section>
        <Skeleton className="mb-4 h-7 w-40" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <SongItemSkeleton key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
