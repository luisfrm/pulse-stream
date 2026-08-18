import { SongItemSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

export default function AlbumLoading() {
  return (
    <div className="flex flex-col gap-8">
      <section className="border-b border-bg-highlight bg-bg-elevated/60 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 sm:flex-row sm:items-end">
          <Skeleton className="h-40 w-40 shrink-0 sm:h-52 sm:w-52" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-10 w-2/3 max-w-sm" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </section>
      <div className="space-y-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <SongItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}