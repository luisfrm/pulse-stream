import { SongItemSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

/** Skeleton del detalle de playlist: hero (cover + título + acciones) + lista. */
export default function PlaylistDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="relative overflow-hidden rounded-3xl border border-bg-highlight bg-bg-elevated">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:gap-8 sm:p-8">
          <Skeleton className="h-40 w-40 shrink-0 sm:h-48 sm:w-48" />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-5 w-24" shape="pill" />
            <Skeleton className="h-9 w-2/3 max-w-sm" />
            <Skeleton className="h-4 w-1/2 max-w-xs" />
            <Skeleton className="h-11 w-36" shape="pill" />
          </div>
        </div>
      </div>
      <div className="mt-8 space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <SongItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}