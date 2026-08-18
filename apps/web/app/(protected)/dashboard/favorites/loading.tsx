import { SongItemSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

export default function FavoritesLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-56" />
      <div className="mt-6 space-y-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <SongItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}