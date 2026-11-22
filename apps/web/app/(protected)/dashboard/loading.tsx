import { CarouselSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

/** Skeleton del home: header + carruseles principales (mismos títulos). */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>
      <CarouselSkeleton title="Lo más escuchado por ti" />
      <CarouselSkeleton title="Seguí escuchando" />
      <CarouselSkeleton title="Tus playlists" />
    </div>
  );
}
