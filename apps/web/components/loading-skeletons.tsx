import { Skeleton } from "@/components/ui";

/** Cover cuadrado + 2 líneas de texto — espejo de SongCard/PlaylistCard. */
export function MediaCardSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-3">
      <Skeleton className="aspect-square w-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/** Fila de canción (cover chico + 2 líneas + acciones) — listas/detalles. */
export function SongItemSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated/60 p-3">
      <Skeleton className="h-11 w-11 shrink-0" shape="rect" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-9 w-9 shrink-0" shape="circle" />
    </div>
  );
}

/** Header de sección + grilla de tarjetas — espejo de los boards del dashboard. */
export function SectionGridSkeleton({
  title,
  cards = 5,
}: {
  title?: string;
  cards?: number;
}) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        {title ? <Skeleton className="h-7 w-48" /> : <Skeleton className="h-7 w-40" />}
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {Array.from({ length: cards }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

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