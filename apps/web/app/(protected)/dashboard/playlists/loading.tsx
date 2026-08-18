import { Skeleton } from "@/components/ui";

export default function PlaylistsLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-8">
        <Skeleton className="h-5 w-56" />
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-full rounded-2xl border border-bg-highlight bg-bg-elevated p-5"
            >
              <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-16 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-10">
        <Skeleton className="h-5 w-36" />
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-full rounded-2xl border border-bg-highlight bg-bg-elevated p-5"
            >
              <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-16 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}