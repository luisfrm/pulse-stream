import { MediaCardSkeleton, SongItemSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

export default function ArtistLoading() {
  return (
    <div className="flex flex-col gap-10">
      <section className="bg-brand-gradient -mx-4 px-6 py-12 lg:-mx-8">
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
            {Array.from({ length: 6 }).map((_, i) => (
              <SongItemSkeleton key={i} />
            ))}
          </div>
        </section>
        <section>
          <Skeleton className="h-6 w-40" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <MediaCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}