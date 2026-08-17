"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface PaginationProps {
  readonly page: number;
  readonly totalPages: number;
  readonly limit: number;
}

/**
 * Paginación desacoplada: navega cambiando `?offset=` en la URL.
 * El RSC se re-ejecuta y vuelve a fetchear con el nuevo offset.
 */
export function Pagination({ page, totalPages, limit }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const navigate = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("offset", String((newPage - 1) * limit));
    router.push(`?${params.toString()}`);
  };

  return (
    <nav className="flex items-center justify-center gap-4 pt-4">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => navigate(Math.max(1, page - 1))}
        className="rounded-pill border border-bg-highlight px-4 py-2 text-sm font-medium text-text-subdued transition-colors hover:border-brand-400 hover:text-text-primary disabled:opacity-40"
      >
        ← Anterior
      </button>
      <span className="text-xs text-text-subdued">
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => navigate(Math.min(totalPages, page + 1))}
        className="rounded-pill border border-bg-highlight px-4 py-2 text-sm font-medium text-text-subdued transition-colors hover:border-brand-400 hover:text-text-primary disabled:opacity-40"
      >
        Siguiente →
      </button>
    </nav>
  );
}
