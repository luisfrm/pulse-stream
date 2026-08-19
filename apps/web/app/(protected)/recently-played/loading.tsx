import { SectionGridSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

export default function RecentlyPlayedLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </div>
      <SectionGridSkeleton cards={10} />
    </div>
  );
}