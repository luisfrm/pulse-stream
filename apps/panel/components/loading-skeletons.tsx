import { Skeleton } from "@pulse-stream/ui";

/** Card del panel admin (título + filas) — páginas del panel. */
export function PanelCardSkeleton() {
  return (
    <div className="rounded-2xl border border-bg-highlight bg-bg-elevated p-5">
      <Skeleton className="h-5 w-32" />
      <div className="mt-4 space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
