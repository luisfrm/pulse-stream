import { Skeleton } from "@/components/ui";

/** Skeleton de Configuración: header + lista de opciones (3 filas). */
export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />

      <div className="mt-8 divide-y divide-bg-highlight overflow-hidden rounded-2xl border border-bg-highlight bg-bg-elevated">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="h-10 w-10 shrink-0" shape="circle" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
            <Skeleton className="h-9 w-24 shrink-0" shape="pill" />
          </div>
        ))}
      </div>
    </div>
  );
}