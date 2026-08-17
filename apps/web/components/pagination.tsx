"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui";

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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => navigate(Math.max(1, page - 1))}
      >
        <ChevronLeft size={16} /> Anterior
      </Button>
      <span className="text-xs text-text-subdued">
        Página {page} de {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => navigate(Math.min(totalPages, page + 1))}
      >
        Siguiente <ChevronRight size={16} />
      </Button>
    </nav>
  );
}
