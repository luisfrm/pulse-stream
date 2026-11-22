"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/components/ui";

interface Chip {
  value: string;
  label: string;
}

interface ChipsProps {
  chips: readonly Chip[];
  /** Query param que guarda el filtro (default "tipo"). */
  param?: string;
}

/**
 * Fila de chips filtradores. El estado vive en la URL: click en el activo lo
 * apaga (vuelve a "sin filtro") y el RSC re-ejecuta con el nuevo param.
 * Usa `useSearchParams`: en una ruta estática el consumidor debe envolverlo en
 * `<Suspense>`.
 */
export function Chips({ chips, param = "tipo" }: ChipsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get(param) ?? "";

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    // El chip activo se apaga; value "" representa "sin filtro" (Todo).
    if (!value || params.get(param) === value) params.delete(param);
    else params.set(param, value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div
      role="group"
      aria-label="Filtros"
      className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4"
    >
      {chips.map((chip) => {
        const isActive = active === chip.value;
        return (
          <button
            key={chip.value}
            type="button"
            onClick={() => select(chip.value)}
            aria-pressed={isActive}
            className={cn(
              "h-8 shrink-0 rounded-pill px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200",
              isActive
                ? "bg-white text-bg-base"
                : "bg-bg-highlight text-text-primary hover:bg-bg-highlight/80"
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
