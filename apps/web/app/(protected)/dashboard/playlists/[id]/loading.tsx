import { SongItemSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

export default function PlaylistDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-24 w-24 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-7 w-2/3 max-w-xs" />
          <Skeleton className="h-4 w-1/2 max-w-[12rem]" />
        </div>
      </div>
      <div className="mt-8 space-y-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <SongItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}