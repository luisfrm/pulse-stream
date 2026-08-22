import { BackLink } from "@/components/back-link";
import { MediaCardSkeleton, SongItemSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

/**
 * Skeleton de Buscar: header + input + resultados.
 * Existe para que /search no caiga al fallback del grupo
 * (`(protected)/loading.tsx` = FullScreenLoader) en cada navegación.
 */
export default function SearchLoading() {
  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/dashboard" />
      <header>
        <Skeleton className="h-10 w-56" />
        <Skeleton className="mt-2 h-4 w-80" />
      </header>

      <Skeleton className="h-12 w-full max-w-md" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>

      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SongItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
