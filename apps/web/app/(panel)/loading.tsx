import { PanelCardSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

/** Skeleton genérico del panel (cubre home, artists, songs, playlists, detalles). */
export default function PanelLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-3 h-4 w-72" />
      <Skeleton className="mt-6 h-12 w-full max-w-md" />
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <PanelCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}