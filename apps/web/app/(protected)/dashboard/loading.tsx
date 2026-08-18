import { SectionGridSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui";

/** Skeleton del dashboard: header + secciones (cada una streamea al resolver). */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-10">
      <div className="animate-rise">
        <Skeleton className="h-10 w-2/3 max-w-md" />
        <Skeleton className="mt-3 h-4 w-1/2 max-w-xs" />
      </div>
      <SectionGridSkeleton title="Seguí escuchando" />
      <SectionGridSkeleton title="Recién agregadas" />
      <SectionGridSkeleton title="Más escuchadas esta semana" />
    </div>
  );
}