import { Skeleton, cn } from "@/components/ui";

/**
 * Cover cuadrado + título (1 línea) y subtítulo (2 líneas) — espejo de MediaCard.
 * `boxed` replica las cards que todavía tienen caja (AlbumCard, cards inline del
 * artista) para no saltar de layout al hidratar.
 */
export function MediaCardSkeleton({ boxed = false }: { boxed?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3",
        boxed && "rounded-2xl border border-bg-highlight bg-bg-elevated p-3"
      )}
    >
      <Skeleton className={cn("aspect-square w-full", !boxed && "rounded-md")} />
      <div className={cn("space-y-2", boxed && "flex-1")}>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  );
}

/** Título de sección + fila de cards sin scrollbar — espejo de Carousel/Section. */
export function CarouselSkeleton({
  title,
  cards = 6,
  className,
}: {
  title?: string;
  cards?: number;
  className?: string;
}) {
  return (
    <section className={className}>
      {title ? (
        <h2 className="mb-4 font-display text-2xl font-bold">{title}</h2>
      ) : (
        <Skeleton className="mb-4 h-7 w-48" />
      )}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="w-[46%] shrink-0 sm:w-[31%] lg:w-[196px]"
          >
            <MediaCardSkeleton />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Card editorial 3:4 + caption — espejo de CollageCard. */
export function CollageCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[3/4] w-full rounded-xl" />
      <Skeleton className="mt-2 h-3 w-32" />
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
  boxed = false,
}: {
  title?: string;
  cards?: number;
  /** true cuando el contenido real de la sección sigue siendo una card con caja. */
  boxed?: boolean;
}) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        {title ? <Skeleton className="h-7 w-48" /> : <Skeleton className="h-7 w-40" />}
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {Array.from({ length: cards }).map((_, i) => (
          <MediaCardSkeleton key={i} boxed={boxed} />
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