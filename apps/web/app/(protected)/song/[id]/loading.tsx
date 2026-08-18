import { Skeleton } from "@/components/ui";

export default function SongLoading() {
  return (
    <div className="flex flex-col gap-8">
      <section className="border-b border-bg-highlight bg-bg-elevated/60 px-6 py-10">
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-4">
          <Skeleton className="h-14 w-14" shape="circle" />
          <div className="w-full space-y-2.5">
            <Skeleton className="h-10 w-2/3 max-w-sm" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-20" shape="pill" />
            ))}
          </div>
        </div>
      </section>
      <div className="mx-auto w-full max-w-3xl space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}