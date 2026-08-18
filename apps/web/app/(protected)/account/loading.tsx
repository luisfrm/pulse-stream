import { Skeleton } from "@/components/ui";

export default function AccountLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Skeleton className="h-9 w-44" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      <div className="mt-8 rounded-2xl border border-bg-highlight bg-bg-elevated/50 p-6">
        <Skeleton className="h-6 w-40" />
        <div className="mt-5 flex flex-col gap-5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="mt-6 h-10 w-40" shape="pill" />
      </div>
    </div>
  );
}